/**
 * Le « menu » : l'arborescence des cours telle que les éditeurs l'ont rangée.
 *
 * Les fichiers Markdown disent QUELS cours existent ; le menu (_menu.json) dit
 * DANS QUEL ORDRE les afficher et COMMENT s'appellent les dossiers (« Réseaux »
 * plutôt que « reseaux »). Il permet aussi d'avoir des dossiers encore vides,
 * ce que git ne sait pas stocker.
 *
 * Ce module ne fait aucune lecture ni écriture : que des fonctions sur l'arbre.
 */
import { z } from 'astro/zod';
import { isValidSlug, joinPath, parentOf, slugOf } from './paths';

export interface MenuCourse {
	type: 'course';
	slug: string;
	/** Copie du titre du cours, pour afficher l'arbre sans ouvrir chaque fichier. */
	title: string;
}

export interface MenuFolder {
	type: 'folder';
	slug: string;
	label: string;
	items: MenuNode[];
}

export type MenuNode = MenuCourse | MenuFolder;

export interface Menu {
	items: MenuNode[];
}

// Le fichier peut avoir été modifié à la main : les slugs sont revalidés, car
// ils servent ensuite à construire des chemins de fichiers.
const Slug = z.string().refine(isValidSlug);
const CourseSchema = z.object({ type: z.literal('course'), slug: Slug, title: z.string() });
const FolderSchema: z.ZodType<MenuFolder> = z.object({
	type: z.literal('folder'),
	slug: Slug,
	label: z.string(),
	items: z.lazy(() => z.array(NodeSchema)),
});
const NodeSchema: z.ZodType<MenuNode> = z.union([CourseSchema, FolderSchema]);
const MenuSchema = z.object({ items: z.array(NodeSchema) });

/** Menu lu depuis le fichier ; vide si le fichier est absent ou invalide. */
export function parseMenu(raw: string | null): Menu {
	if (!raw) return { items: [] };
	try {
		return MenuSchema.parse(JSON.parse(raw));
	} catch {
		return { items: [] };
	}
}

export const serializeMenu = (menu: Menu) => `${JSON.stringify(menu, null, '\t')}\n`;

/** Contenu d'un dossier ('' = racine), ou `null` s'il n'existe pas. */
export function itemsOf(menu: Menu, folderPath: string): MenuNode[] | null {
	let items = menu.items;
	for (const slug of folderPath ? folderPath.split('/') : []) {
		const folder = items.find((node) => node.type === 'folder' && node.slug === slug);
		if (folder?.type !== 'folder') return null;
		items = folder.items;
	}
	return items;
}

export function findNode(menu: Menu, path: string): MenuNode | null {
	return itemsOf(menu, parentOf(path))?.find((node) => node.slug === slugOf(path)) ?? null;
}

/** « tcp-ip » → « Tcp ip » : nom par défaut d'un dossier créé hors de l'admin. */
const humanize = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1).replaceAll('-', ' ');

/** Crée les dossiers manquants le long du chemin et renvoie le contenu du dernier. */
export function ensureFolder(menu: Menu, folderPath: string): MenuNode[] {
	let items = menu.items;
	for (const slug of folderPath ? folderPath.split('/') : []) {
		let folder = items.find((node) => node.slug === slug);
		if (folder?.type !== 'folder') {
			folder = { type: 'folder', slug, label: humanize(slug), items: [] };
			items.push(folder);
		}
		items = folder.items;
	}
	return items;
}

/** Retire un nœud de l'arbre et le renvoie. */
export function removeNode(menu: Menu, path: string): MenuNode | null {
	const siblings = itemsOf(menu, parentOf(path));
	const index = siblings?.findIndex((node) => node.slug === slugOf(path)) ?? -1;
	return index < 0 ? null : siblings!.splice(index, 1)[0];
}

/** Insère un nœud dans un dossier, avant le voisin `beforeSlug` (ou à la fin). */
export function insertNode(items: MenuNode[], node: MenuNode, beforeSlug?: string | null): void {
	const index = beforeSlug ? items.findIndex((sibling) => sibling.slug === beforeSlug) : -1;
	items.splice(index < 0 ? items.length : index, 0, node);
}

/** Identifiants de tous les cours d'un nœud (lui-même compris si c'est un cours). */
export function courseIdsOf(node: MenuNode, path: string): string[] {
	if (node.type === 'course') return [path];
	return node.items.flatMap((child) => courseIdsOf(child, joinPath(path, child.slug)));
}

/** Nombre de niveaux occupés par un nœud : 1 pour un cours, 1 + son contenu pour un dossier. */
export function depthOf(node: MenuNode): number {
	if (node.type === 'course') return 1;
	return 1 + Math.max(0, ...node.items.map(depthOf));
}

/**
 * Aligne le menu sur les fichiers réellement présents : retire les cours dont
 * le fichier a disparu, signale ceux qui manquent (ajoutés avec git, par exemple).
 */
export function missingFrom(menu: Menu, courseIds: string[]): string[] {
	const existing = new Set(courseIds);
	const prune = (items: MenuNode[], folderPath: string) => {
		for (let index = items.length - 1; index >= 0; index--) {
			const node = items[index];
			const path = joinPath(folderPath, node.slug);
			if (node.type === 'folder') prune(node.items, path);
			else if (!existing.delete(path)) items.splice(index, 1);
		}
	};
	prune(menu.items, '');
	return [...existing].sort();
}
