import type { APIRoute } from 'astro';
import { editorOf, respond } from '../../../lib/admin/http';
import { getTree } from '../../../lib/admin/library';

export const prerender = false;

/** Arborescence complète des dossiers et des cours, dans l'ordre du menu. */
export const GET: APIRoute = (context) => respond(async () => ({ items: await getTree(editorOf(context).store) }));
