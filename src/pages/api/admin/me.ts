import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { AdminError, githubOf, readJson, respond } from '../../../lib/admin/http';
import { REQUIRED_APPROVALS, getOwnProposal } from '../../../lib/admin/proposals';
import { isLocalMode } from '../../../lib/admin/store';

export const prerender = false;

const DirectSchema = z.discriminatedUnion('direct', [
	z.object({ direct: z.literal(false) }),
	z.object({
		direct: z.literal(true),
		reason: z.string().trim().min(5, 'Explique en quelques mots pourquoi tu publies sans relecture.').max(200),
	}),
]);

/** Qui est connecté, avec quel rôle, et où partent ses enregistrements. */
export const GET: APIRoute = (context) =>
	respond(async () => {
		const { login, name, avatar, role } = context.locals.user!;
		const local = isLocalMode();
		const direct = role === 'referent' ? (context.locals.direct ?? null) : null;
		return {
			user: { login, name, avatar, role },
			/** Stockage local (développement) : ni proposition, ni relecture. */
			local,
			direct,
			required: REQUIRED_APPROVALS,
			proposal: local ? null : await getOwnProposal(githubOf(context), context.locals.user!),
		};
	});

/**
 * Active ou coupe la publication directe d'un référent. Le mode vit dans la session,
 * côté serveur : le navigateur ne peut pas le prétendre, et il s'éteint à la déconnexion.
 */
export const POST: APIRoute = (context) =>
	respond(async () => {
		if (context.locals.user!.role !== 'referent') {
			throw new AdminError(403, 'Seuls les référents peuvent publier sans relecture.');
		}
		const input = await readJson(context.request, DirectSchema);
		if (input.direct) context.session?.set('direct', { reason: input.reason });
		else context.session?.delete('direct');
		return { direct: input.direct ? { reason: input.reason } : null };
	});
