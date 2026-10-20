import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getTree } from '../lib/admin/library';
import { COURSES_DIR } from '../lib/admin/paths';
import { localStore } from '../lib/admin/store/local';

/**
 * Index de la doc, fabriqué au build, pour le forum (forum.babouins.fr) :
 * - `tree`  : les dossiers et les pages, dans l'ordre et avec les noms du menu ;
 * - `pages` : titre, description et texte de chaque page, pour la recherche commune.
 * Le forum s'en sert pour ranger ses sujets dans les dossiers de la doc et pour chercher dans
 * les deux à la fois. Tout ce qu'il contient est déjà public sur le site.
 */

/** Préfixe des identifiants de la collection pour les pages de la doc (`docs/sisr/...`). */
const PREFIX = `${COURSES_DIR.split('/').at(-1)}/`;

/** Markdown vers texte brut, assez pour chercher dedans (les commandes restent, la syntaxe part). */
const plain = (markdown: string) =>
	markdown
		.replace(/^```.*$/gm, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/:?-{3,}:?/g, ' ') // filets des tableaux
		.replace(/[#>*_`|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export const GET: APIRoute = async () => {
	const [tree, entries] = await Promise.all([getTree(localStore), getCollection('docs')]);
	const pages = entries
		.filter((entry) => entry.id.startsWith(PREFIX))
		.map((entry) => ({
			id: entry.id.slice(PREFIX.length),
			title: entry.data.title,
			description: entry.data.description ?? '',
			text: plain(entry.body ?? ''),
		}));
	return Response.json({ tree, pages });
};
