import type { APIRoute } from 'astro';
import { ADMIN_DEV_LOGIN } from 'astro:env/server';
import { buildAuthorizeUrl, callbackUrl, isOAuthConfigured } from '../../lib/admin/github-oauth';
import { adminUrl } from '../../lib/admin/paths';
import { isLocalMode } from '../../lib/admin/store';

export const prerender = false;

/** Démarre la connexion : redirige vers GitHub, qui renverra sur /admin/callback. */
export const GET: APIRoute = async ({ session, redirect, url }) => {
	// Raccourci de développement, en stockage local seulement (il ne donne pas de jeton GitHub).
	// `isLocalMode()` vaut toujours `false` dans un build de production : ce bloc n'y sert jamais.
	if (isLocalMode() && ADMIN_DEV_LOGIN) {
		session?.set('user', {
			login: ADMIN_DEV_LOGIN,
			name: ADMIN_DEV_LOGIN,
			email: `${ADMIN_DEV_LOGIN}@localhost`,
			avatar: '',
			role: 'referent',
		});
		const openPage = await session?.get('openPage'); // page demandée avant la connexion (voir middleware.ts)
		session?.delete('openPage');
		return redirect(adminUrl(openPage));
	}

	if (!isOAuthConfigured()) {
		return new Response('Connexion indisponible : OAUTH_CLIENT_ID et OAUTH_CLIENT_SECRET ne sont pas définis.', {
			status: 503,
		});
	}

	const state = crypto.randomUUID();
	session?.set('oauthState', state);
	return redirect(buildAuthorizeUrl(state, callbackUrl(url)));
};
