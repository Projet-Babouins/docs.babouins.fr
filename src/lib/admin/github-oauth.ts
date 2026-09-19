import { GITHUB_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } from 'astro:env/server';
import { createGitHub } from './github';

/**
 * Connexion via GitHub (flux « authorization code »), avec une **GitHub App**.
 *
 * Pourquoi une GitHub App et pas une « OAuth App » : le jeton qu'elle donne agit au nom
 * de l'utilisateur, mais il est limité aux permissions de l'App (contenu et pull requests)
 * et au seul dépôt où elle est installée. Même volé, il ne donne accès à rien d'autre.
 * Il reste dans la session, côté serveur : il n'est jamais envoyé au navigateur ni journalisé.
 * Il expire au bout de 8 heures, comme la session (voir `session.ttl` dans astro.config.mjs).
 * Doc : https://docs.github.com/fr/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
 */

export const isOAuthConfigured = () => Boolean(OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET);

/**
 * URL de retour déclarée dans la GitHub App. En production, elle part de `site`
 * (astro.config.mjs) : derrière un reverse proxy, l'URL de la requête serait celle
 * de Node (http://localhost…), pas celle du site.
 */
export function callbackUrl(requestUrl: URL): string {
	const origin = import.meta.env.DEV ? requestUrl.origin : import.meta.env.SITE;
	return new URL('/admin/callback', origin).toString();
}

/** URL de la page de connexion GitHub vers laquelle rediriger l'utilisateur. */
export function buildAuthorizeUrl(state: string, redirectUri: string): string {
	const url = new URL('/login/oauth/authorize', GITHUB_URL);
	url.search = new URLSearchParams({ client_id: OAUTH_CLIENT_ID ?? '', redirect_uri: redirectUri, state }).toString();
	return url.toString();
}

export interface Authenticated {
	user: AdminUser;
	token: string;
}

/**
 * Échange le code reçu de GitHub contre l'identité de l'utilisateur et son jeton.
 * Renvoie `null` si l'utilisateur n'a pas le droit d'écrire dans le dépôt de la doc.
 */
export async function authenticate(code: string, redirectUri: string): Promise<Authenticated | null> {
	const tokenResponse = await fetch(new URL('/login/oauth/access_token', GITHUB_URL), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({
			client_id: OAUTH_CLIENT_ID,
			client_secret: OAUTH_CLIENT_SECRET,
			code,
			redirect_uri: redirectUri,
		}),
	});
	// GitHub répond 200 même en cas de refus : l'erreur est dans le corps de la réponse.
	const { access_token: token, error } = (await tokenResponse.json().catch(() => ({}))) as {
		access_token?: string;
		error?: string;
	};
	if (!tokenResponse.ok || !token) throw new Error(`Échange du code OAuth refusé (${error ?? tokenResponse.status})`);

	const github = createGitHub(token);
	const [profile, repo] = await Promise.all([
		github.getGlobal<{ id: number; login: string; name: string | null; avatar_url: string }>('/user'),
		github.get<{ permissions?: { push?: boolean; maintain?: boolean; admin?: boolean } }>(''),
	]);
	if (!repo.permissions?.push) return null;

	return {
		token,
		user: {
			login: profile.login,
			name: profile.name || profile.login,
			// Adresse « noreply » de GitHub : elle relie les commits au compte sans publier la vraie
			// adresse d'un étudiant dans l'historique git d'un dépôt public.
			email: `${profile.id}+${profile.login}@users.noreply.github.com`,
			avatar: profile.avatar_url,
			// Une seule source de vérité pour les référents : leur rôle sur le dépôt GitHub.
			role: repo.permissions.maintain || repo.permissions.admin ? 'referent' : 'contributeur',
		},
	};
}
