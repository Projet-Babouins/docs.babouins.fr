/**
 * La « bibliothèque » : toutes les opérations de l'admin sur les cours et les
 * dossiers. Chaque opération lit le menu, le modifie, puis enregistre les
 * fichiers touchés ET le menu en un seul lot (store.commit).
 *
 * Chaque opération reçoit un `Editor` : qui modifie, et dans quel stockage. Ce fichier
 * ne sait donc pas si l'enregistrement part dans une proposition ou directement sur le site.
 */
import { createHash } from 'node:crypto';
import { parseCourse, serializeCourse, type CourseFields } from './frontmatter';
import { AdminError } from './errors';
import {
	courseIdsOf,
	depthOf,
	ensureFolder,
	findNode,
	insertNode,
	itemsOf,
	missingFrom,
	parseMenu,
	removeNode,
	serializeMenu,
	type Menu,
	type MenuNode,
} from './menu';
import {
	COURSES_DIR,
	MAX_DEPTH,
	MENU_FILE,
	courseFilePath,
	courseUrl,
	isValidCourseId,
	isValidFolderPath,
	joinPath,
	parentOf,
	slugOf,
	slugify,
} from './paths';
import type { ContentStore, Editor, FileChange } from './store/types';

/** Nœud de l'arbre envoyé au navigateur : le menu, avec le chemin complet de chaque nœud. */
export type TreeNode =
	| { type: 'course'; path: string; title: string }
	| { type: 'folder'; path: string; label: string; items: TreeNode[] };

export interface SaveCourseInput extends CourseFields {
	/** Cours ouvert dans l'éditeur ; `null` pour une création. */
	originalId: string | null;
	/** Version chargée par l'éditeur ; obligatoire pour modifier un cours existant. */
	version: string | null;
	folder: string;
	/** Nom de fichier ; vide = déduit du titre. */
	slug: string;
}

const versionOf = (raw: string) => createHash('sha256').update(raw).digest('hex').slice(0, 16);
const menuChange = (menu: Menu): FileChange => ({ path: MENU_FILE, content: serializeMenu(menu) });
const depthOfPath = (path: string) => (path ? path.split('/').length : 0);

// Une seule modification à la fois : deux requêtes simultanées ne peuvent pas
// lire le même menu puis écraser le travail l'une de l'autre.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
	const result = queue.then(task, task);
	queue = result.catch(() => undefined);
	return result;
}

const READ_TOGETHER = 10;

/** Menu aligné sur les fichiers présents (cours ajoutés ou supprimés hors de l'admin). */
async function loadMenu(store: ContentStore): Promise<Menu> {
	const menu = parseMenu(await store.read(MENU_FILE));
	const courseIds = (await store.list(COURSES_DIR))
		.filter((file) => file.endsWith('.md'))
		.map((file) => file.slice(COURSES_DIR.length + 1, -'.md'.length))
		.filter(isValidCourseId);

	// Lues ensemble, par petits groupes : à la file, chaque page coûterait un aller-retour vers GitHub.
	const missing = missingFrom(menu, courseIds);
	for (let start = 0; start < missing.length; start += READ_TOGETHER) {
		const ids = missing.slice(start, start + READ_TOGETHER);
		const raws = await Promise.all(ids.map((id) => store.read(courseFilePath(id))));
		ids.forEach((id, index) => {
			const title = parseCourse(raws[index] ?? '').title || slugOf(id);
			ensureFolder(menu, parentOf(id)).push({ type: 'course', slug: slugOf(id), title });
		});
	}
	return menu;
}

function folderItems(menu: Menu, folderPath: string): MenuNode[] {
	const items = isValidFolderPath(folderPath) ? itemsOf(menu, folderPath) : null;
	if (!items) throw new AdminError(404, 'Ce dossier n’existe pas (ou plus).');
	return items;
}

function assertFreeSlug(items: MenuNode[], slug: string) {
	if (!slug) throw new AdminError(400, 'Le nom doit contenir au moins une lettre ou un chiffre.');
	if (items.some((node) => node.slug === slug)) {
		throw new AdminError(409, `Il existe déjà un élément « ${slug} » dans ce dossier.`);
	}
}

/** Déplacements de fichiers pour tous les cours d'un nœud qui change de chemin. */
function moveChanges(node: MenuNode, fromPath: string, toPath: string): FileChange[] {
	return courseIdsOf(node, fromPath).map((id) => ({
		from: courseFilePath(id),
		path: courseFilePath(toPath + id.slice(fromPath.length)),
	}));
}

// --- Lecture -------------------------------------------------------------

export async function getTree(store: ContentStore): Promise<TreeNode[]> {
	const toTree = (items: MenuNode[], folderPath: string): TreeNode[] =>
		items.map((node) => {
			const path = joinPath(folderPath, node.slug);
			return node.type === 'course'
				? { type: 'course', path, title: node.title }
				: { type: 'folder', path, label: node.label, items: toTree(node.items, path) };
		});
	return toTree((await loadMenu(store)).items, '');
}

export async function getCourse(store: ContentStore, id: string) {
	if (!isValidCourseId(id)) throw new AdminError(400, 'Identifiant de page invalide.');
	const raw = await store.read(courseFilePath(id));
	if (raw === null) throw new AdminError(404, 'Page introuvable.');
	return { id, version: versionOf(raw), url: courseUrl(id), ...parseCourse(raw) };
}

// --- Cours ---------------------------------------------------------------

export const saveCourse = (input: SaveCourseInput, { store, author }: Editor) =>
	exclusive(async () => {
		const menu = await loadMenu(store);
		const menuBefore = serializeMenu(menu);
		const slug = slugify(input.slug || input.title);
		const id = joinPath(input.folder, slug);
		const target = folderItems(menu, input.folder);
		if (!isValidCourseId(id)) throw new AdminError(400, 'Emplacement invalide : trop de niveaux de dossiers.');

		let previousRaw: string | undefined;
		if (input.originalId !== null) {
			if (!isValidCourseId(input.originalId)) throw new AdminError(400, 'Page d’origine invalide.');
			previousRaw = (await store.read(courseFilePath(input.originalId))) ?? undefined;
			if (previousRaw === undefined) throw new AdminError(404, 'Cette page n’existe plus.');
			if (versionOf(previousRaw) !== input.version) {
				throw new AdminError(409, 'Cette page a été modifiée par quelqu’un d’autre. Recharge-la avant d’enregistrer.');
			}
		}

		const raw = serializeCourse(input, previousRaw);
		const node: MenuNode = { type: 'course', slug, title: input.title };
		if (input.originalId === id) {
			Object.assign(findNode(menu, id) ?? {}, node);
		} else {
			assertFreeSlug(target, slug);
			// Renommé dans le même dossier : le cours garde sa place. Sinon, à la fin.
			const siblings = input.originalId === null ? null : itemsOf(menu, parentOf(input.originalId));
			const index = siblings?.findIndex((sibling) => sibling.slug === slugOf(input.originalId!)) ?? -1;
			if (siblings === target && index >= 0) target[index] = node;
			else {
				// Une nouvelle page n'est PAS écrite dans le menu : `loadMenu` la range à la fin de son
				// dossier, comme le fait le site. Deux propositions qui ajoutent chacune une page ne
				// modifient donc pas le même fichier, et ne se bloquent pas l'une l'autre.
				if (input.originalId !== null) {
					removeNode(menu, input.originalId);
					target.push(node);
				}
			}
		}

		const moved = input.originalId !== null && input.originalId !== id;
		const changes: FileChange[] = [
			{ path: courseFilePath(id), content: raw, from: moved ? courseFilePath(input.originalId!) : undefined },
		];
		// Corriger le texte d'une page ne touche pas au menu : seuls un titre, un nom ou une place qui change.
		if (serializeMenu(menu) !== menuBefore) changes.push(menuChange(menu));
		await store.commit(changes, {
			author,
			message: `${input.originalId === null ? 'Ajoute' : 'Modifie'} la page « ${input.title} »`,
		});
		return { id, version: versionOf(raw), url: courseUrl(id) };
	});

export const deleteCourse = (id: string, { store, author }: Editor) =>
	exclusive(async () => {
		if (!isValidCourseId(id)) throw new AdminError(400, 'Identifiant de page invalide.');
		// Lu avant `loadMenu`, qui ajoute au menu les pages absentes du fichier (toute page récente, voir
		// saveCourse) : une telle page se supprime sans toucher au menu. Un seul fichier change.
		const listed = findNode(parseMenu(await store.read(MENU_FILE)), id) !== null;
		const menu = await loadMenu(store);
		const node = removeNode(menu, id);
		if (node?.type !== 'course') throw new AdminError(404, 'Page introuvable.');
		await store.commit([{ path: courseFilePath(id), content: null }, ...(listed ? [menuChange(menu)] : [])], {
			author,
			message: `Supprime la page « ${node.title} »`,
		});
	});

// --- Dossiers ------------------------------------------------------------

export const createFolder = (parent: string, label: string, { store, author }: Editor) =>
	exclusive(async () => {
		const menu = await loadMenu(store);
		const siblings = folderItems(menu, parent);
		const slug = slugify(label);
		assertFreeSlug(siblings, slug);
		const path = joinPath(parent, slug);
		if (!isValidFolderPath(path)) throw new AdminError(400, 'Trop de niveaux de dossiers (5 au maximum).');

		siblings.push({ type: 'folder', slug, label, items: [] });
		await store.commit([menuChange(menu)], { author, message: `Ajoute le dossier « ${label} »` });
		return { path };
	});

/** Renomme un dossier. Changer `slug` change l'URL de tous ses cours : c'est un déplacement. */
export const updateFolder = (path: string, label: string, slugInput: string, { store, author }: Editor) =>
	exclusive(async () => {
		const menu = await loadMenu(store);
		const folder = isValidFolderPath(path) && path ? findNode(menu, path) : null;
		if (folder?.type !== 'folder') throw new AdminError(404, 'Ce dossier n’existe pas (ou plus).');

		const changes: FileChange[] = [];
		const slug = slugify(slugInput) || folder.slug;
		const newPath = joinPath(parentOf(path), slug);
		if (slug !== folder.slug) {
			assertFreeSlug(folderItems(menu, parentOf(path)), slug);
			changes.push(...moveChanges(folder, path, newPath));
			folder.slug = slug;
		}
		folder.label = label;

		await store.commit([...changes, menuChange(menu)], { author, message: `Renomme le dossier « ${label} »` });
		return { path: newPath };
	});

/** Supprime un dossier et tous les cours qu'il contient. */
export const deleteFolder = (path: string, { store, author }: Editor) =>
	exclusive(async () => {
		const menu = await loadMenu(store);
		const folder = isValidFolderPath(path) && path ? removeNode(menu, path) : null;
		if (folder?.type !== 'folder') throw new AdminError(404, 'Ce dossier n’existe pas (ou plus).');

		const deletions = courseIdsOf(folder, path).map((id) => ({ path: courseFilePath(id), content: null }));
		await store.commit([...deletions, menuChange(menu)], {
			author,
			message: `Supprime le dossier « ${folder.label} » (${deletions.length} pages)`,
		});
	});

// --- Déplacement et ordre ---------------------------------------------------

/**
 * Déplace un cours ou un dossier dans `targetFolder`, juste avant le voisin
 * `before` (chemin complet), ou à la fin si `before` est `null`. Dans le même
 * dossier, c'est un simple changement d'ordre : seul le menu est réécrit.
 */
export const moveNode = (path: string, targetFolder: string, before: string | null, { store, author }: Editor) =>
	exclusive(async () => {
		const menu = await loadMenu(store);
		const node = isValidCourseId(path) ? findNode(menu, path) : null;
		if (!node) throw new AdminError(404, 'Élément introuvable.');
		if (targetFolder === path || targetFolder.startsWith(`${path}/`)) {
			throw new AdminError(400, 'Un dossier ne peut pas être déplacé dans lui-même.');
		}
		if (before === path) return { path }; // déposé juste avant lui-même : rien à faire
		const target = folderItems(menu, targetFolder);
		if (depthOfPath(targetFolder) + depthOf(node) > MAX_DEPTH) {
			throw new AdminError(400, 'Déplacement impossible : trop de niveaux de dossiers.');
		}

		const changes: FileChange[] = [];
		const newPath = joinPath(targetFolder, node.slug);
		if (newPath !== path) {
			assertFreeSlug(target, node.slug);
			changes.push(...moveChanges(node, path, newPath));
		}
		removeNode(menu, path);
		insertNode(target, node, before === null ? null : slugOf(before));

		const name = node.type === 'course' ? node.title : node.label;
		await store.commit([...changes, menuChange(menu)], { author, message: `Déplace « ${name} »` });
		return { path: newPath };
	});
