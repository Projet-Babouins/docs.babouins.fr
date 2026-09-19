import { GITHUB_API_URL, GITHUB_REPO } from 'astro:env/server';
import { AdminError } from './errors';

/**
 * Petit client de l'API GitHub. Tous les appels de l'admin passent par ici, avec le
 * jeton de la personne connectée : GitHub applique donc SES droits, et chaque commit,
 * proposition ou validation est faite en son nom.
 * Doc : https://docs.github.com/fr/rest
 */

const TIMEOUT_MS = 15_000;
/** Type de réponse demandé à GitHub pour recevoir un fichier tel quel, et pas sa fiche en JSON. */
const RAW = 'application/vnd.github.raw+json';

/** Erreur renvoyée par GitHub, avec son code HTTP : l'appelant décide quoi en faire. */
export class GitHubError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export type GitHub = ReturnType<typeof createGitHub>;

export function createGitHub(token: string) {
	async function call<T>(method: string, url: string, body?: unknown, accept = 'application/vnd.github+json'): Promise<T> {
		const response = await fetch(url, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: accept,
				'Content-Type': 'application/json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			// GitHub injoignable : on échoue vite, sinon toutes les actions de l'admin attendraient derrière.
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});

		if (response.status === 401) throw new AdminError(401, 'Ta session GitHub a expiré. Reconnecte-toi.');
		if (!response.ok) {
			const detail = (await response.json().catch(() => null)) as { message?: string } | null;
			// Le jeton n'apparaît jamais dans ce journal : seulement la route et la réponse de GitHub.
			console.error(`GitHub ${response.status} sur ${method} ${new URL(url).pathname} : ${detail?.message ?? ''}`);
			throw new GitHubError(response.status, detail?.message ?? `GitHub a répondu ${response.status}.`);
		}
		if (response.status === 204) return undefined as T;
		return (accept === RAW ? response.arrayBuffer() : response.json()) as Promise<T>;
	}

	/** Routes du dépôt de la doc : `/pulls`, `/git/trees/…` */
	const repo = (path: string) => `${GITHUB_API_URL}/repos/${GITHUB_REPO}${path}`;

	return {
		get: <T>(path: string) => call<T>('GET', repo(path)),
		/** Contenu brut d'un fichier, texte ou image (route `/contents/…`). */
		getBytes: async (path: string) => Buffer.from(await call<ArrayBuffer>('GET', repo(path), undefined, RAW)),
		post: <T>(path: string, body: unknown) => call<T>('POST', repo(path), body),
		patch: <T>(path: string, body: unknown) => call<T>('PATCH', repo(path), body),
		put: <T>(path: string, body: unknown) => call<T>('PUT', repo(path), body),
		delete: (path: string) => call<void>('DELETE', repo(path)),
		/** Route hors du dépôt, par exemple `/user`. */
		getGlobal: <T>(path: string) => call<T>('GET', `${GITHUB_API_URL}${path}`),
		/** API GraphQL : certaines actions (la fusion automatique) n'existent que là. */
		async graphql(query: string, variables: Record<string, unknown>): Promise<void> {
			const result = await call<{ errors?: { message: string }[] }>('POST', `${GITHUB_API_URL}/graphql`, { query, variables });
			if (result.errors?.length) throw new GitHubError(422, result.errors[0].message);
		},
	};
}
