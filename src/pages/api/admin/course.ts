import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { editorOf, readJson, respond } from '../../../lib/admin/http';
import { deleteCourse, getCourse, saveCourse } from '../../../lib/admin/library';

export const prerender = false;

const SaveSchema = z.object({
	originalId: z.string().nullable(),
	version: z.string().nullable(),
	folder: z.string().max(400),
	slug: z.string().max(100),
	title: z.string().trim().min(1, 'Le titre est obligatoire.').max(150),
	description: z.string().trim().max(300),
	body: z.string().max(500_000),
});

/** Lit un cours. */
export const GET: APIRoute = (context) =>
	respond(() => getCourse(editorOf(context).store, context.url.searchParams.get('id') ?? ''));

/** Crée, modifie, renomme ou déplace un cours. */
export const PUT: APIRoute = (context) =>
	respond(async () => saveCourse(await readJson(context.request, SaveSchema), editorOf(context)));

/** Supprime un cours. */
export const DELETE: APIRoute = (context) =>
	respond(() => deleteCourse(context.url.searchParams.get('id') ?? '', editorOf(context)));
