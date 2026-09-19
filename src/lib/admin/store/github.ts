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
 * Appels utilisés :
 *  - GET   /branches/<branche>                le dernier commit de la branche ;
 *  - GET   /git/trees/<sha>?recursive=1       tous les fichiers, avec leur empreinte git (sha) ;
 *  - GET   /git/blobs/<sha>                   le contenu d'un fichier ;
 *  - PUT ou DELETE /contents/<chemin>         un commit d'UN fichier, en un seul appel (le cas courant) ;
 *  - POST  /git/blobs, /git/trees, /git/commits, puis PATCH /git/refs/heads/<branche> : l'API
 *    « Git Database », la seule qui sait faire un commit de plusieurs fichiers.
 * Doc : https://docs.github.com/fr/rest/repos/contents et https://docs.github.com/fr/rest/git
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

/** Un changement prêt à partir. */
interface Planned {
	path: string;
	/** Empreinte du fichier après le commit ; `null` = suppression. */
	sha: string | null;
	/** Contenu à écrire. Absent pour une suppression, et pour un fichier déplacé tel quel (il garde son empreinte). */
	bytes?: Buffer;
	/** Le même contenu en texte, quand c'en est un. */
	text?: string;
}

/** Ce que GitHub renvoie après un commit fait par `/contents`. */
interface ContentsCommit {
	commit: { sha: string; tree: { sha: string }; parents: { sha: string }[] };
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

	/**
	 * Un seul fichier écrit ou supprimé (corriger un texte, créer une page, envoyer une image, ranger le
	 * menu) : l'API `/contents` fait le commit en UN appel. `sha` est l'empreinte du fichier remplacé :
	 * GitHub refuse s'il a changé entre-temps. Renvoie la nouvelle photo, ou `null` si la branche avait
	 * avancé par ailleurs (d'autres fichiers ont bougé : la photo sera redemandée).
	 */
	async function commitOne(change: Planned, current: Snapshot, body: Record<string, unknown>): Promise<Snapshot | null> {
		const url = `/contents/${change.path.split('/').map(encodeURIComponent).join('/')}`;
		const request = { ...body, branch, sha: current.files.get(change.path) };
		const { commit } = change.bytes
			? await github.put<ContentsCommit>(url, { ...request, content: change.bytes.toString('base64') })
			: await github.delete<ContentsCommit>(url, request);
		return commit.parents[0]?.sha === current.head ? { head: commit.sha, tree: commit.tree.sha, files: current.files } : null;
	}

	/** Plusieurs fichiers d'un coup (déplacer, renommer, supprimer un dossier) : arbre, commit, puis branche. */
	async function commitMany(changes: Planned[], current: Snapshot, body: Record<string, unknown>): Promise<Snapshot> {
		const entries = await Promise.all(
			changes.map(async ({ path, sha, bytes, text }) => {
				if (text !== undefined) return { path, mode: '100644', type: 'blob', content: text };
				// Une image ne peut pas voyager en texte dans l'arbre : elle est envoyée à part.
				const blob = bytes && (await github.post<{ sha: string }>('/git/blobs', { content: bytes.toString('base64'), encoding: 'base64' }));
				return { path, mode: '100644', type: 'blob', sha: blob ? blob.sha : sha };
			}),
		);
		const tree = await github.post<{ sha: string }>('/git/trees', { base_tree: current.tree, tree: entries });
		const commit = await github.post<{ sha: string }>('/git/commits', { ...body, tree: tree.sha, parents: [current.head] });
		// `force: false` : GitHub refuse si la branche a avancé depuis la photo.
		await github.patch(`/git/refs/heads/${refOf(branch)}`, { sha: commit.sha, force: false });
		return { head: commit.sha, tree: tree.sha, files: current.files };
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
			// La photo peut avoir quelques secondes. Sans danger : si ce qu'elle décrit a bougé depuis,
			// GitHub refuse le commit et personne n'écrase personne.
			const current = await snapshotOf(github, branch);
			const planned: Planned[] = [];

			for (const change of changes) {
				const path = checked(change.path);
				const from = change.from === undefined ? undefined : checked(change.from);
				// Empreinte du fichier déjà en place (à son ancien chemin s'il est déplacé).
				const sha = current.files.get(from ?? path);

				if (change.content === null) {
					if (sha) planned.push({ path, sha: null });
					continue;
				}
				if (from && !sha) throw new AdminError(409, CONFLICT); // le fichier à déplacer a disparu
				if (from) planned.push({ path: from, sha: null });

				// Déplacement seul : le fichier garde son contenu, donc son empreinte.
				if (change.content === undefined) {
					if (sha) planned.push({ path, sha });
					continue;
				}

				const bytes = Buffer.from(change.content);
				const newSha = blobSha(bytes);
				if (!from && sha === newSha) continue; // contenu identique : pas d'écriture inutile
				const text = typeof change.content === 'string' ? change.content : undefined;
				if (text !== undefined) remember(newSha, text);
				planned.push({ path, sha: newSha, bytes, text });
			}
			if (planned.length === 0) return;

			const body = {
				message: options.trailer ? `${message}\n\n${options.trailer}` : message,
				// L'adresse « noreply » de la personne (voir github-oauth.ts) : sa vraie adresse n'entre pas dans
				// l'historique public. Sans adresse, GitHub signe avec le compte du jeton : le même compte.
				...(author.email ? { author: { ...author, date: new Date().toISOString() }, committer: author } : {}),
			};
			try {
				const [only] = planned;
				const single = planned.length === 1 && (only.sha === null || only.bytes !== undefined);
				const done = single ? await commitOne(only, current, body) : await commitMany(planned, current, body);
				if (!done) {
					forgetBranch(branch);
					return;
				}

				// La branche est maintenant exactement ceci : rafraîchir l'arbre ne redemandera rien.
				const next = new Map(current.files);
				for (const { path, sha } of planned) {
					if (sha === null) next.delete(path);
					else next.set(path, sha);
				}
				keep(branch, { ...done, files: next });
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
