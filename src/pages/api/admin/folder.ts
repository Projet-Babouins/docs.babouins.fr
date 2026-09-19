import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { editorOf, readJson, respond } from '../../../lib/admin/http';
import { createFolder, deleteFolder, updateFolder } from '../../../lib/admin/library';

export const prerender = false;

const Label = z.string().trim().min(1, 'Le nom du dossier est obligatoire.').max(60);
const CreateSchema = z.object({ parent: z.string().max(400), label: Label });
const UpdateSchema = z.object({ path: z.string().max(400), label: Label, slug: z.string().max(100) });

/** Crée un dossier (vide) dans `parent`. */
export const POST: APIRoute = (context) =>
	respond(async () => {
		const { parent, label } = await readJson(context.request, CreateSchema);
		return createFolder(parent, label, editorOf(context));
	});

/** Renomme un dossier ; changer `slug` déplace tous ses cours. */
export const PATCH: APIRoute = (context) =>
	respond(async () => {
		const { path, label, slug } = await readJson(context.request, UpdateSchema);
		return updateFolder(path, label, slug, editorOf(context));
	});

/** Supprime un dossier et tout son contenu. */
export const DELETE: APIRoute = (context) =>
	respond(() => deleteFolder(context.url.searchParams.get('path') ?? '', editorOf(context)));
