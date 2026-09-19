import { createHash } from 'node:crypto';
import { GitHubError, type GitHub } from '../github';
import { AdminError } from '../errors';
import { COURSES_DIR, MEDIA_DIR } from '../paths';
import type { ContentStore } from './types';

/**
 * Stockage dans le dépôt GitHub, par son API : chaque lot de changements devient
 * UN commit sur une branche, fait avec le jeton de la personne connectée.
 *
 * La branche dépend de qui enregistre (voir store/index.ts) : la branche de sa
 * proposition (elle sera relue), ou `main` pour une publication directe.
 *
 * Appels utilisés (API « Git Database », la seule qui sait faire un commit de plusieurs fichiers) :
 *  - GET   /branches/<branche>                le dernier commit de la branche ;
 *  - GET   /git/trees/<sha>?recursive=1       tous les fichiers, avec leur empreinte git (sha) ;
 *  - GET   /git/blobs/<sha>                   le contenu d'un fichier ;
 *  - POST  /git/blobs, /git/trees, /git/commits, puis PATCH /git/refs/heads/<branche>.
 * Doc : https://docs.github.com/fr/rest/git
 *
 * Chaque appel à GitHub prend un quart de seconde ou plus, et ils se suivent : c'est ce qui rend
 * une action lente. Ce fichier en fait donc le moins possible, grâce à la « photo » d'une branche
 * (voir `Snapshot`) : elle sert quelques secondes sans rien redemander, et un commit réussi la
 * met à jour sur place au lieu de tout relire.
 */

/**
 * Durée pendant laquelle la photo d'une branche sert sans rien redemander à GitHub. Ce qui est
 * écrit ailleurs (une fusion, un commit fait avec Git) apparaît donc ici avec ce retard au plus.
 */
const SNAPSHOT_MS = 10_000;
const MAX_CACHED_TEXTS = 500;
export const CONFLICT = 'Le dépôt a changé entre-temps. Recharge la page, puis réessaie.';

/** Seuls dossiers que l'admin a le droit de lire et d'écrire. */
const ALLOWED_ROOTS = [COURSES_DIR, MEDIA_DIR];

/**
 * Dernier filet de sécurité, comme dans local.ts : même si un chemin invalide
 * arrivait jusqu'ici, il ne peut pas désigner un fichier hors des dossiers autorisés.
 */
function checked(path: string): string {
	const inside = ALLOWED_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
	const clean = !path.includes('\\') && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
	if (!inside || !clean) throw new Error(`Chemin hors des dossiers autorisés : ${path}`);
	return path;
}

/**
 * Empreinte git d'un contenu, calculée comme le fait git. Deux contenus identiques
 * ont la même empreinte : on sait donc, sans rien télécharger, si un fichier changerait.
 */
const blobSha = (bytes: Buffer) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

/** Photo d'une branche : son dernier commit et tous ses fichiers. Jamais modifiée : un commit en crée une nouvelle. */
interface Snapshot {
	/** Dernier commit : le parent du prochain. */
	head: string;
	/** Arbre git de ce commit : la base du prochain. */
	tree: string;
	/** chemin → empreinte */
	files: ReadonlyMap<string, string>;
}

// Les deux caches sont partagés entre tous les utilisateurs : le dépôt est public, et ce
// qu'ils contiennent ne dépend pas de qui lit.
const snapshots = new Map<string, { checkedAt: number; value: Promise<Snapshot> }>();
/** Une empreinte désigne un contenu précis : ce cache n'est jamais périmé. */
const texts = new Map<string, string>();

function remember(sha: string, text: string) {
	if (texts.size >= MAX_CACHED_TEXTS) texts.clear();
	texts.set(sha, text);
}

/** À appeler quand une branche a bougé sans passer par ce fichier (fusion, mise à jour). */
export const forgetBranch = (branch: string) => snapshots.delete(branch);

const keep = (branch: string, snapshot: Snapshot) =>
	snapshots.set(branch, { checkedAt: Date.now(), value: Promise.resolve(snapshot) });

const refOf = (branch: string) => encodeURIComponent(branch);

/** Tous les fichiers d'une branche ou d'un arbre git, avec l'empreinte de cet arbre. */
async function listFiles(github: GitHub, ref: string) {
	const { sha, tree } = await github.get<{ sha: string; tree: { path: string; type: string; sha: string }[] }>(
		`/git/trees/${ref}?recursive=1`,
	);
	return { sha, files: new Map(tree.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry.sha])) };
}

async function takeSnapshot(github: GitHub, branch: string, previous?: Snapshot): Promise<Snapshot> {
	// Sans photo précédente, les fichiers sont demandés en même temps que le dernier commit.
	const [{ commit: head }, guess] = await Promise.all([
		github.get<{ commit: { sha: string; commit: { tree: { sha: string } } } }>(`/branches/${refOf(branch)}`),
		previous ? undefined : listFiles(github, refOf(branch)),
	]);
	if (previous?.head === head.sha) return previous; // la branche n'a pas bougé : ses fichiers non plus
	const tree = head.commit.tree.sha;
	// Un commit est arrivé entre les deux réponses : les fichiers sont redemandés, pour ce commit précis.
	const { files } = guess?.sha === tree ? guess : await listFiles(github, tree);
	return { head: head.sha, tree, files };
}

/** Photo d'une branche, vérifiée auprès de GitHub seulement si elle a plus de `SNAPSHOT_MS`. */
function snapshotOf(github: GitHub, branch: string): Promise<Snapshot> {
	const cached = snapshots.get(branch);
	if (cached && Date.now() - cached.checkedAt < SNAPSHOT_MS) return cached.value;

	const previous = cached?.value.catch(() => undefined);
	const taken = {
		checkedAt: Date.now(),
		value: Promise.resolve(previous).then((before) => takeSnapshot(github, branch, before)),
	};
	taken.value.catch(() => {
		if (snapshots.get(branch) === taken) snapshots.delete(branch); // un échec n'est pas gardé en mémoire
	});
	snapshots.set(branch, taken);
	return taken.value;
}

/**
 * (Re)crée `branch` à partir de l'état connu de `from`, et lui donne la même photo : rien à relire.
 * Partir de l'état LU (et pas d'un état plus récent) est voulu : c'est sur lui que la personne a travaillé.
 */
export async function resetBranch(github: GitHub, branch: string, from: string): Promise<void> {
	const base = await snapshotOf(github, from);
	try {
		await github.post('/git/refs', { ref: `refs/heads/${branch}`, sha: base.head });
	} catch (error) {
		// 422 : la branche existe encore (reste d'une proposition publiée ou retirée). On la ramène sur `from`.
		if (!(error instanceof GitHubError) || error.status !== 422) throw error;
		await github.patch(`/git/refs/heads/${refOf(branch)}`, { sha: base.head, force: true });
	}
	keep(branch, base);
}

interface TreeEntry {
	path: string;
	mode: '100644';
	type: 'blob';
	sha?: string | null;
	content?: string;
}

export function createGitHubStore(github: GitHub, branch: string, options: { trailer?: string } = {}): ContentStore {
	const files = async () => (await snapshotOf(github, branch)).files;

	async function fetchBlob(sha: string): Promise<Buffer> {
		const blob = await github.get<{ content: string }>(`/git/blobs/${sha}`);
		return Buffer.from(blob.content, 'base64');
	}

	async function readBlob(sha: string): Promise<string> {
		const cached = texts.get(sha);
		if (cached !== undefined) return cached;
		const text = (await fetchBlob(sha)).toString('utf8');
		remember(sha, text);
		return text;
	}

	return {
		async list(folder) {
			const prefix = `${checked(folder)}/`;
			return [...(await files()).keys()].filter((path) => path.startsWith(prefix));
		},

		async read(path) {
			const sha = (await files()).get(checked(path));
			return sha === undefined ? null : readBlob(sha);
		},

		// Pas de cache ici : les images sont gardées par le navigateur (voir api/admin/media.ts).
		async readBytes(path) {
			const sha = (await files()).get(checked(path));
			return sha === undefined ? null : fetchBlob(sha);
		},

		async commit(changes, { author, message }) {
			// La photo peut avoir quelques secondes. Sans danger : si la branche a bougé depuis,
			// GitHub refuse le commit (`force: false` plus bas) et personne n'écrase personne.
			const current = await snapshotOf(github, branch);
			const next = new Map(current.files);
			const entries: TreeEntry[] = [];
			/** Note un changement : dans le commit à envoyer, et dans la photo d'après. */
			const put = (path: string, sha: string | null, content?: string) => {
				entries.push({ path, mode: '100644', type: 'blob', ...(content === undefined ? { sha } : { content }) });
				if (sha === null) next.delete(path);
				else next.set(path, sha);
			};

			for (const change of changes) {
				const path = checked(change.path);
				const from = change.from === undefined ? undefined : checked(change.from);
				// Empreinte du fichier déjà en place (à son ancien chemin s'il est déplacé).
				const sha = current.files.get(from ?? path);

				if (change.content === null) {
					if (sha) put(path, null);
					continue;
				}
				if (from && !sha) throw new AdminError(409, CONFLICT); // le fichier à déplacer a disparu
				if (from) put(from, null);

				// Déplacement seul : le fichier garde son contenu, donc son empreinte.
				if (change.content === undefined) {
					if (sha) put(path, sha);
					continue;
				}

				const bytes = Buffer.from(change.content);
				const newSha = blobSha(bytes);
				if (!from && sha === newSha) continue; // contenu identique : pas d'écriture inutile

				if (typeof change.content === 'string') {
					remember(newSha, change.content);
					put(path, newSha, change.content);
				} else {
					// Une image ne peut pas voyager en texte dans l'arbre : elle est envoyée à part.
					const blob = await github.post<{ sha: string }>('/git/blobs', {
						content: bytes.toString('base64'),
						encoding: 'base64',
					});
					put(path, blob.sha);
				}
			}
			if (entries.length === 0) return;

			try {
				const tree = await github.post<{ sha: string }>('/git/trees', { base_tree: current.tree, tree: entries });
				const commit = await github.post<{ sha: string }>('/git/commits', {
					message: options.trailer ? `${message}\n\n${options.trailer}` : message,
					tree: tree.sha,
					parents: [current.head],
					// Sans adresse e-mail, GitHub signe avec le compte du jeton : le même compte.
					author: author.email ? { ...author, date: new Date().toISOString() } : undefined,
				});
				// `force: false` : GitHub refuse si la branche a avancé depuis la photo.
				await github.patch(`/git/refs/heads/${refOf(branch)}`, { sha: commit.sha, force: false });
				// La branche est maintenant exactement ceci : rafraîchir l'arbre ne redemandera rien.
				keep(branch, { head: commit.sha, tree: tree.sha, files: next });
			} catch (error) {
				forgetBranch(branch); // refusé : la photo n'est plus fiable
				if (error instanceof GitHubError && (error.status === 409 || error.status === 422)) {
					throw new AdminError(409, CONFLICT);
				}
				throw error;
			}
		},
	};
}
