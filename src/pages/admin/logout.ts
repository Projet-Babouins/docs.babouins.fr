import type { APIRoute } from 'astro';

export const prerender = false;

/** Déconnexion. En POST uniquement : un simple lien ne doit pas pouvoir déconnecter. */
export const POST: APIRoute = async ({ session, redirect }) => {
	session?.destroy();
	return redirect('/');
};
