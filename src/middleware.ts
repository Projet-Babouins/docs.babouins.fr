import { defineMiddleware } from 'astro:middleware';

/** Routes de l'espace admin accessibles sans être connecté. */
const PUBLIC_ADMIN_ROUTES = new Set(['/admin/login', '/admin/callback']);

/**
 * Point de contrôle unique de l'espace admin : toute route /admin ou /api/admin
 * exige une session. Les pages publiques du site ne passent pas par ici.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const pathname = context.url.pathname.replace(/\/$/, '');
	const isAdminApi = pathname.startsWith('/api/admin');
	const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');

	if (!isAdminApi && !isAdminPage) return next();
	if (PUBLIC_ADMIN_ROUTES.has(pathname)) return next();

	const user = await context.session?.get('user');
	if (!user) {
		if (isAdminApi) {
			return Response.json({ error: 'Connexion requise.' }, { status: 401 });
		}
		return context.redirect('/admin/login');
	}

	context.locals.user = user;
	// Le jeton GitHub et le mode de publication ne quittent jamais le serveur : ils vont de la
	// session aux routes de l'API, jamais dans une page ni dans une réponse.
	context.locals.githubToken = await context.session?.get('githubToken');
	context.locals.direct = await context.session?.get('direct');
	return next();
});
