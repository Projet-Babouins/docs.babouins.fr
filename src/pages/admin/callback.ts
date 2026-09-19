import type { APIRoute } from 'astro';
import { authenticate, callbackUrl } from '../../lib/admin/github-oauth';
import { adminUrl } from '../../lib/admin/paths';

export const prerender = false;

/** Retour de GitHub après connexion : vérifie, puis ouvre la session. */
export const GET: APIRoute = async ({ session, redirect, url }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const expectedState = await session?.get('oauthState');
	session?.delete('oauthState');

	// Le `state` prouve que ce retour répond bien à une connexion lancée depuis ce navigateur.
	if (!code || !state || state !== expectedState) {
		return new Response('Connexion invalide ou expirée. Réessaie depuis /admin.', { status: 400 });
	}

	// Code expiré ou déjà utilisé, GitHub injoignable… : un message clair plutôt qu'une erreur 500.
	const authenticated = await authenticate(code, callbackUrl(url)).catch((error) => {
		console.error(error);
		return undefined;
	});
	if (authenticated === undefined) {
		return new Response('La connexion avec GitHub a échoué. Réessaie depuis /admin.', { status: 502 });
	}
	if (!authenticated) {
		return new Response(
			"Ce compte GitHub n'est pas encore membre du projet. Demande à un référent de t'ajouter à l'organisation Projet-Babouins.",
			{ status: 403 },
		);
	}

	const openPage = await session?.get('openPage'); // page demandée avant la connexion (voir middleware.ts)
	session?.delete('openPage');
	// Nouvel identifiant de session à la connexion (contre la fixation de session).
	await session?.regenerate();
	session?.set('user', authenticated.user);
	session?.set('githubToken', authenticated.token);
	return redirect(adminUrl(openPage));
};
