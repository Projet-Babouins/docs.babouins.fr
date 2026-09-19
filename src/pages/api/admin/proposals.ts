import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { githubOf, proposalNumberOf, readJson, respond } from '../../../lib/admin/http';
import {
	getProposal,
	getProposalPage,
	listProposals,
	publishProposal,
	reviewProposal,
	updateProposal,
	withdrawProposal,
} from '../../../lib/admin/proposals';

export const prerender = false;

const Message = z.string().trim().max(2000).default('');
const ActionSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.enum(['approve', 'request-changes', 'comment']),
		number: z.number().int().positive(),
		message: Message,
		/** Version que le relecteur a sous les yeux : son avis ne vaut que pour elle. */
		headSha: z.string().regex(/^[0-9a-f]{40}$/),
	}),
	z.object({ action: z.literal('withdraw'), number: z.number().int().positive() }),
	z.object({ action: z.literal('update'), number: z.number().int().positive() }),
	z.object({
		action: z.literal('publish'),
		number: z.number().int().positive(),
		message: z.string().trim().min(5, 'Explique en quelques mots pourquoi tu publies sans relecture.').max(200),
	}),
]);

/**
 * Sans paramètre : les propositions ouvertes. Avec `number` : le détail d'une proposition.
 * Avec `number` et `page` : le contenu d'une page telle qu'elle est proposée.
 */
export const GET: APIRoute = (context) =>
	respond(async () => {
		const github = githubOf(context);
		const me = context.locals.user!;
		const number = proposalNumberOf(context.url);
		if (number === null) return { items: await listProposals(github, me) };

		const page = context.url.searchParams.get('page');
		return page === null ? getProposal(github, number, me) : getProposalPage(github, number, page);
	});

/** Donne un avis, retire, met à jour ou (référent) publie une proposition. Renvoie son nouvel état. */
export const POST: APIRoute = (context) =>
	respond(async () => {
		const github = githubOf(context);
		const me = context.locals.user!;
		const input = await readJson(context.request, ActionSchema);

		if (input.action === 'withdraw') return withdrawProposal(github, me, input.number);
		if (input.action === 'publish') return publishProposal(github, me, input.number, input.message);
		if (input.action === 'update') await updateProposal(github, input.number);
		else await reviewProposal(github, me, input);
		return getProposal(github, input.number, me);
	});
