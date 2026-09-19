import { createHash } from 'node:crypto';
import { GitHubError, type GitHub } from '../github';
import { AdminError } from '../errors';
import { COURSES_DIR, MEDIA_DIR } from '../paths';
import type { ContentStore } from './types';

/**
 * Stockage dans le dépôt GitHub, par son API : chaque lot de changements devient
 * UN commit sur une branche, fait avec le jeton de la personne connectée.
 *
 * La branche dépend de qui enregistre (voir workspace.ts) : la branche de sa
 * proposition (elle sera relue), ou `main` pour une publication directe.
 *
 * Appels utilisés (API « Git Database », la seule qui sait faire un commit de plusieurs fichiers) :
 *  - GET   /git/trees/<branche>?recursive=1   tous les fichiers, avec leur empreinte git (sha) ;
 *  - GET   /git/blobs/<sha>                   le contenu d'un fichier ;
 *  - POST  /git/blobs, /git/trees, /git/commits, puis PATCH /git/refs/heads/<branche>.
 * Doc : https://docs.github.com/fr/rest/git
 */

/** Durée de vie de la photo d'une branche. Courte : elle évite juste de relister 3 fois par action. */
const SNAPSHOT_MS = 2_000;
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

// Les deux caches sont partagés entre tous les utilisateurs : le dépôt est public, et ce
// qu'ils contiennent ne dépend pas de qui lit.
type Snapshot = Map<string, string>; // chemin → empreinte
const snapshots = new Map<string, { takenAt: number; files: Promise<Snapshot> }>();
/** Une empreinte désigne un contenu précis : ce cache n'est jamais périmé. */
const texts = new Map<string, string>();

function remember(sha: string, text: string) {
	if (texts.size >= MAX_CACHED_TEXTS) texts.clear();
	texts.set(sha, text);
}

/** À appeler quand une branche a bougé sans passer par ce fichier (fusion, mise à jour). */
export const forgetBranch = (branch: string) => snapshots.delete(branch);

interface TreeEntry {
	path: string;
	mode: '100644';
	type: 'blob';
	sha?: string | null;
	content?: string;
}

export function createGitHubStore(github: GitHub, branch: string, options: { trailer?: string } = {}): ContentStore {
	const ref = encodeURIComponent(branch);

	async function fetchFiles(): Promise<Snapshot> {
		const { tree } = await github.get<{ tree: { path: string; type: string; sha: string }[] }>(
			`/git/trees/${ref}?recursive=1`,
		);
		return new Map(tree.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry.sha]));
	}

	function files(): Promise<Snapshot> {
		let snapshot = snapshots.get(branch);
		if (!snapshot || Date.now() - snapshot.takenAt > SNAPSHOT_MS) {
			const taken = { takenAt: Date.now(), files: fetchFiles() };
			taken.files.catch(() => {
				if (snapshots.get(branch) === taken) snapshots.delete(branch); // un échec n'est pas gardé en mémoire
			});
			snapshots.set(branch, (snapshot = taken));
		}
		return snapshot.files;
	}

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
			forgetBranch(branch); // on repart de l'état exact de la branche, pas d'une photo
			const current = await files();
			const entries: TreeEntry[] = [];

			for (const change of changes) {
				const path = checked(change.path);
				const from = change.from === undefined ? undefined : checked(change.from);
				// Empreinte du fichier déjà en place (à son ancien chemin s'il est déplacé).
				const sha = current.get(from ?? path);

				if (change.content === null) {
					if (sha) entries.push({ path, mode: '100644', type: 'blob', sha: null });
					continue;
				}
				if (from && !sha) throw new AdminError(409, CONFLICT); // le fichier à déplacer a disparu
				if (from) entries.push({ path: from, mode: '100644', type: 'blob', sha: null });

				// Déplacement seul : le fichier garde son contenu, donc son empreinte.
				if (change.content === undefined) {
					if (sha) entries.push({ path, mode: '100644', type: 'blob', sha });
					continue;
				}

				const bytes = Buffer.from(change.content);
				const newSha = blobSha(bytes);
				if (!from && sha === newSha) continue; // contenu identique : pas d'écriture inutile

				if (typeof change.content === 'string') {
					remember(newSha, change.content);
					entries.push({ path, mode: '100644', type: 'blob', content: change.content });
				} else {
					// Une image ne peut pas voyager en texte dans l'arbre : elle est envoyée à part.
					const blob = await github.post<{ sha: string }>('/git/blobs', {
						content: bytes.toString('base64'),
						encoding: 'base64',
					});
					entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
				}
			}
			if (entries.length === 0) return;

			try {
				const head = await github.get<{ commit: { sha: string; commit: { tree: { sha: string } } } }>(`/branches/${ref}`);
				const tree = await github.post<{ sha: string }>('/git/trees', {
					base_tree: head.commit.commit.tree.sha,
					tree: entries,
				});
				const commit = await github.post<{ sha: string }>('/git/commits', {
					message: options.trailer ? `${message}\n\n${options.trailer}` : message,
					tree: tree.sha,
					parents: [head.commit.sha],
					// Sans adresse e-mail, GitHub signe avec le compte du jeton : le même compte.
					author: author.email ? { ...author, date: new Date().toISOString() } : undefined,
				});
				// `force: false` : GitHub refuse si la branche a avancé depuis la lecture de `head`.
				await github.patch(`/git/refs/heads/${ref}`, { sha: commit.sha, force: false });
			} catch (error) {
				if (error instanceof GitHubError && (error.status === 409 || error.status === 422)) {
					throw new AdminError(409, CONFLICT);
				}
				throw error;
			} finally {
				forgetBranch(branch); // réussi ou refusé, la photo n'est plus fiable
			}
		},
	};
}
