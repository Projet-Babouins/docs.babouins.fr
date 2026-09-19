import { defineMiddleware } from 'astro:middleware';

/** Routes de l'espace admin accessibles sans être connecté. */
const PUBLIC_ADMIN_ROUTES = new Set(['/admin/login', '/admin/callback']);
/** Méthodes qui ne modifient rien : pas besoin de vérifier d'où vient la requête. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Adresse publique du site. En production elle vient de `site` (astro.config.mjs) : derrière le
 * reverse proxy, l'URL vue par Node est http://localhost:<port>, pas celle du site (même raison
 * que `callbackUrl` dans github-oauth.ts).
 */
const siteOrigin = (requestUrl: URL) => (import.meta.env.DEV ? requestUrl.origin : new URL(import.meta.env.SITE).origin);

/**
 * Point de contrôle unique de l'espace admin : toute route /admin ou /api/admin
 * exige une session. Les pages publiques du site ne passent pas par ici.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	// Protection CSRF : une requête qui modifie quelque chose doit venir d'une page du site (en-tête
	// `Origin`, que le navigateur écrit lui-même). Remplace `security.checkOrigin` d'Astro, qui compare
	// à l'URL vue par Node : fausse derrière le proxy, elle refusait les suppressions et les envois d'images.
	if (!SAFE_METHODS.has(context.request.method) && !context.isPrerendered) {
		if (context.request.headers.get('origin') !== siteOrigin(context.url)) {
			return Response.json({ error: 'Requête refusée : elle ne vient pas du site.' }, { status: 403 });
		}
	}

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
