import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { editorOf, readJson, respond } from '../../../lib/admin/http';
import { moveNode } from '../../../lib/admin/library';

export const prerender = false;

const MoveSchema = z.object({
	path: z.string().max(400),
	targetFolder: z.string().max(400),
	/** Voisin avant lequel insérer ; `null` = à la fin du dossier. */
	before: z.string().max(400).nullable(),
});

/** Déplace ou réordonne un cours ou un dossier (glisser-déposer). */
export const POST: APIRoute = (context) =>
	respond(async () => {
		const { path, targetFolder, before } = await readJson(context.request, MoveSchema);
		return moveNode(path, targetFolder, before, editorOf(context));
	});
