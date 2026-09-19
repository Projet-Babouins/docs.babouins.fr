/**
 * Middleware de route Starlight : applique le menu des cours (_menu.json) à la
 * barre latérale du site. Starlight génère la liste des cours à partir des
 * fichiers, triée par ordre alphabétique et avec les noms de dossiers bruts ;
 * ici on la remet dans l'ordre choisi dans l'admin, avec les vrais noms.
 * Doc : https://starlight.astro.build/guides/route-data/
 */
import { readFileSync } from 'node:fs';
import { defineRouteMiddleware, type StarlightRouteData } from '@astrojs/starlight/route-data';
import { parseMenu, type Menu, type MenuNode } from './lib/admin/menu';
import { COURSES_URL, MENU_FILE } from './lib/admin/paths';

type SidebarEntry = StarlightRouteData['sidebar'][number];
type SidebarLink = Extract<SidebarEntry, { type: 'link' }>;

let cachedMenu: Menu | undefined;

function readMenu(): Menu {
	// En développement, le menu est relu à chaque page pour suivre l'admin en direct.
	if (cachedMenu && !import.meta.env.DEV) return cachedMenu;
	let raw: string | null = null;
	try {
		raw = readFileSync(MENU_FILE, 'utf8');
	} catch {
		// Pas encore de menu : on garde l'ordre de Starlight.
	}
	return (cachedMenu = parseMenu(raw));
}

const flatten = (entries: SidebarEntry[]): SidebarLink[] =>
	entries.flatMap((entry) => (entry.type === 'link' ? [entry] : flatten(entry.entries)));

/** Nom de fichier ou de dossier d'une entrée, au niveau `depth` sous /cours/. */
function slugAt(entry: SidebarEntry, depth: number): string | undefined {
	const href = flatten([entry])[0]?.href;
	if (!href?.startsWith(`${COURSES_URL}/`)) return undefined;
	return href.slice(COURSES_URL.length + 1).split('/')[depth];
}

/** Trie les entrées comme dans le menu et renomme les groupes, niveau par niveau. */
function arrange(entries: SidebarEntry[], nodes: MenuNode[], depth: number): void {
	const rankOf = (entry: SidebarEntry) => {
		const index = nodes.findIndex((node) => node.slug === slugAt(entry, depth));
		return index < 0 ? nodes.length : index; // inconnu du menu : à la fin
	};
	entries.sort((a, b) => rankOf(a) - rankOf(b));

	for (const entry of entries) {
		if (entry.type !== 'group') continue;
		const folder = nodes.find((node) => node.type === 'folder' && node.slug === slugAt(entry, depth));
		if (folder?.type !== 'folder') continue;
		entry.label = folder.label;
		arrange(entry.entries, folder.items, depth + 1);
	}
}

export const onRequest = defineRouteMiddleware((context) => {
	const route = context.locals.starlightRoute;
	const menu = readMenu();

	for (const entry of route.sidebar) {
		if (entry.type === 'group' && slugAt(entry, 0) !== undefined) arrange(entry.entries, menu.items, 0);
	}

	// Les liens « Précédent / Suivant » ont été calculés avant le tri : on les refait,
	// sauf si la page les définit elle-même dans son frontmatter.
	const links = flatten(route.sidebar);
	const current = links.findIndex((link) => link.isCurrent);
	if (current >= 0) {
		if (route.entry.data.prev === undefined) route.pagination.prev = links[current - 1];
		if (route.entry.data.next === undefined) route.pagination.next = links[current + 1];
	}
});
