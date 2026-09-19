import type { APIContext } from 'astro';
import type { z } from 'astro/zod';
import { AdminError } from './errors';
import { createGitHub, GitHubError, type GitHub } from './github';
import { isLocalMode, storeFor, type Editor } from './store';

export { AdminError };

/** Réponse d'erreur JSON, au même format sur toute l'API admin. */
export const fail = (error: string, status: number) => Response.json({ error }, { status });

/**
 * Enveloppe commune des routes de l'API : exécute l'action, renvoie son
 * résultat en JSON et traduit les erreurs en réponses HTTP.
 */
export async function respond(action: () => Promise<unknown>): Promise<Response> {
	try {
		const result = await action();
		if (result instanceof Response) return result; // réponse déjà prête (une image, par exemple)
		return result === undefined ? new Response(null, { status: 204 }) : Response.json(result);
	} catch (error) {
		if (error instanceof AdminError) return fail(error.message, error.status);
		// Refus de GitHub non prévu par le code : son message est affiché tel quel, c'est le plus utile.
		if (error instanceof GitHubError) {
			return fail(`GitHub a refusé l'action : ${error.message}`, [403, 404].includes(error.status) ? error.status : 502);
		}
		if (error instanceof Error && error.name === 'TimeoutError') return fail('GitHub ne répond pas. Réessaie dans un instant.', 504);
		console.error(error);
		return fail(error instanceof Error ? error.message : 'Erreur interne.', 500);
	}
}

/** Corps JSON de la requête, validé par un schéma ; AdminError 400 sinon. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw new AdminError(400, parsed.error.issues[0]?.message ?? 'Données invalides.');
	return parsed.data;
}

/** L'utilisateur connecté, avec le stockage qui correspond à son rôle et à son mode. */
export function editorOf({ locals, request }: APIContext): Editor {
	const user = locals.user!; // garanti par src/middleware.ts
	return { store: storeFor(locals, request.method !== 'GET'), author: { name: user.name, email: user.email } };
}

/** Client GitHub de l'utilisateur connecté, pour les propositions. Indisponible en stockage local. */
export function githubOf({ locals }: APIContext): GitHub {
	if (isLocalMode()) throw new AdminError(503, 'Les propositions ne sont pas disponibles en stockage local.');
	if (!locals.githubToken) throw new AdminError(401, 'Ta session GitHub a expiré. Reconnecte-toi.');
	return createGitHub(locals.githubToken);
}

/** Numéro de proposition lu dans l'URL ; `null` si le paramètre est absent, AdminError 400 s'il est invalide. */
export function proposalNumberOf(url: URL, name = 'number'): number | null {
	const raw = url.searchParams.get(name);
	if (raw === null) return null;
	const number = Number(raw);
	if (!Number.isInteger(number) || number <= 0) throw new AdminError(400, 'Numéro de proposition invalide.');
	return number;
}
