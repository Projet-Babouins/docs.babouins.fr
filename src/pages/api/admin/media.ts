import type { APIRoute } from 'astro';
import { AdminError, editorOf, githubOf, proposalNumberOf, respond } from '../../../lib/admin/http';
import { MEDIA_DIR, MEDIA_TYPES, isValidMediaName } from '../../../lib/admin/paths';
import { getProposalBytes } from '../../../lib/admin/proposals';

export const prerender = false;

/**
 * Sert une image du stockage à l'éditeur. Une image tout juste envoyée n'est pas encore
 * en ligne sur /media (elle attend dans une proposition, ou le site n'est pas encore
 * reconstruit) : sans cette route, l'éditeur afficherait une image cassée.
 * Avec `proposal=<numéro>`, l'image est lue dans la proposition relue, pas dans la sienne.
 */
export const GET: APIRoute = (context) =>
	respond(async () => {
		const name = context.url.searchParams.get('file') ?? '';
		if (!isValidMediaName(name)) throw new AdminError(400, 'Nom d’image invalide.');
		const path = `${MEDIA_DIR}/${name}`;
		const proposal = proposalNumberOf(context.url, 'proposal');
		const bytes = proposal
			? await getProposalBytes(githubOf(context), proposal, path)
			: await editorOf(context).store.readBytes(path);
		if (!bytes) throw new AdminError(404, 'Image introuvable.');

		return new Response(Buffer.from(bytes), {
			headers: {
				'Content-Type': MEDIA_TYPES[name.split('.')[1]],
				// Le navigateur ne doit jamais interpréter ce fichier comme autre chose qu'une image.
				'X-Content-Type-Options': 'nosniff',
				'Content-Security-Policy': "default-src 'none'",
				// Un nom d'image n'est jamais réutilisé (suffixe aléatoire) : cache long, privé.
				'Cache-Control': 'private, max-age=31536000, immutable',
			},
		});
	});
