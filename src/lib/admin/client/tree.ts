/**
 * Arborescence des cours : affichage, recherche, menu d'actions et
 * glisser-déposer (ranger dans un dossier, changer l'ordre).
 */
import { parentOf } from '../paths';
import type { TreeFolder, TreeNode } from './api';
import { icon } from './icons';
import { el, openMenu, type MenuItem } from './ui';

export interface TreeHandlers {
	openCourse(path: string): void;
	/** Actions proposées pour un nœud (clic droit ou bouton « … »). */
	menuFor(node: TreeNode): MenuItem[];
	move(path: string, targetFolder: string, before: string | null): void;
}

type DropZone = 'before' | 'after' | 'inside';

const COLLAPSED_KEY = 'babouins-admin-collapsed';
const normalize = (text: string) =>
	text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase();

export function createTree(container: HTMLElement, handlers: TreeHandlers) {
	let items: TreeNode[] = [];
	let currentPath: string | null = null;
	let filter = '';
	let dragged: TreeNode | null = null;
	let hoverTimer: number | undefined;
	/** Frères de chaque nœud, pour trouver « le suivant » lors d'un dépôt. */
	const siblings = new Map<string, TreeNode[]>();
	const collapsed = new Set<string>(loadCollapsed());

	function loadCollapsed(): string[] {
		try {
			return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
		} catch {
			return []; // stockage indisponible (navigation privée) : tout reste ouvert
		}
	}

	function toggle(folder: TreeFolder, open?: boolean) {
		const shouldOpen = open ?? collapsed.has(folder.path);
		if (shouldOpen) collapsed.delete(folder.path);
		else collapsed.add(folder.path);
		try {
			localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
		} catch {
			// idem : l'état ne sera simplement pas mémorisé
		}
		// Seul ce dossier est redessiné : pendant un glisser-déposer, la ligne
		// déplacée doit rester dans la page, sinon le navigateur perd le fil.
		const item = container.querySelector(`li[data-path="${CSS.escape(folder.path)}"]`);
		if (item) item.replaceWith(renderNode(folder));
		else render();
	}

	const nameOf = (node: TreeNode) => (node.type === 'course' ? node.title : node.label);

	/** Vrai si le nœud, ou un de ses descendants, correspond à la recherche. */
	const matches = (node: TreeNode): boolean =>
		normalize(nameOf(node)).includes(filter) || (node.type === 'folder' && node.items.some(matches));

	// --- Glisser-déposer ---------------------------------------------------

	function zoneOf(event: DragEvent, row: HTMLElement, node: TreeNode): DropZone {
		const { top, height } = row.getBoundingClientRect();
		const ratio = (event.clientY - top) / height;
		if (node.type === 'course') return ratio < 0.5 ? 'before' : 'after';
		if (ratio < 0.25) return 'before';
		// Sous un dossier ouvert et rempli, « après » tomberait visuellement dans son contenu.
		const isOpenWithItems = !collapsed.has(node.path) && node.items.length > 0;
		return ratio > 0.75 && !isOpenWithItems ? 'after' : 'inside';
	}

	const canDropOn = (node: TreeNode) =>
		dragged !== null && dragged.path !== node.path && !node.path.startsWith(`${dragged.path}/`);

	function clearDropMarks() {
		clearTimeout(hoverTimer);
		for (const row of container.querySelectorAll('.drop-before, .drop-after, .drop-inside')) {
			row.classList.remove('drop-before', 'drop-after', 'drop-inside');
		}
		container.classList.remove('drop-root');
	}

	function drop(node: TreeNode, zone: DropZone) {
		if (!dragged) return;
		const source = dragged.path;
		dragged = null;
		if (zone === 'inside') return handlers.move(source, node.path, null);
		const list = (siblings.get(node.path) ?? []).filter((sibling) => sibling.path !== source);
		const index = list.findIndex((sibling) => sibling.path === node.path);
		const before = zone === 'before' ? node.path : (list[index + 1]?.path ?? null);
		handlers.move(source, parentOf(node.path), before);
	}

	function makeDraggable(row: HTMLElement, node: TreeNode) {
		row.draggable = true;
		row.addEventListener('dragstart', (event) => {
			dragged = node;
			event.dataTransfer!.effectAllowed = 'move';
			event.dataTransfer!.setData('text/plain', node.path);
			row.classList.add('dragging');
		});
		row.addEventListener('dragend', () => {
			dragged = null;
			row.classList.remove('dragging');
			clearDropMarks();
		});
		// `stopPropagation` d'abord, même en cas de refus : sinon l'événement remonte
		// au conteneur, qui l'interpréterait comme « déposer à la racine ».
		row.addEventListener('dragover', (event) => {
			event.stopPropagation();
			if (!canDropOn(node)) return clearDropMarks();
			event.preventDefault();
			const zone = zoneOf(event, row, node);
			if (row.classList.contains(`drop-${zone}`)) return;
			clearDropMarks();
			row.classList.add(`drop-${zone}`);
			// Rester au-dessus d'un dossier fermé l'ouvre, pour pouvoir viser son contenu.
			if (zone === 'inside' && node.type === 'folder' && collapsed.has(node.path)) {
				hoverTimer = window.setTimeout(() => toggle(node, true), 700);
			}
		});
		row.addEventListener('drop', (event) => {
			event.stopPropagation();
			if (!canDropOn(node)) return;
			event.preventDefault();
			const zone = zoneOf(event, row, node);
			clearDropMarks();
			drop(node, zone);
		});
	}

	// Déposer dans le vide, sous l'arbre = ranger à la racine, en dernier.
	container.addEventListener('dragover', (event) => {
		if (!dragged) return;
		event.preventDefault();
		clearDropMarks();
		container.classList.add('drop-root');
	});
	container.addEventListener('dragleave', (event) => {
		if (!container.contains(event.relatedTarget as Node)) clearDropMarks();
	});
	container.addEventListener('drop', (event) => {
		if (!dragged) return;
		event.preventDefault();
		clearDropMarks();
		const source = dragged.path;
		dragged = null;
		handlers.move(source, '', null);
	});

	// --- Affichage -----------------------------------------------------------

	function renderNode(node: TreeNode): HTMLLIElement {
		const isFolder = node.type === 'folder';
		const isOpen = isFolder && (filter !== '' || !collapsed.has(node.path));

		const row = el('div', { class: 'tree-row', title: nameOf(node) });
		if (node.path === currentPath) row.setAttribute('aria-current', 'page');

		const main = el('button', { type: 'button', class: 'tree-main' });
		if (isFolder) {
			const chevron = el('span', { class: `chevron ${isOpen ? 'open' : ''}` }, icon('chevron', 14));
			main.append(chevron, icon(isOpen ? 'folder-open' : 'folder'));
			main.setAttribute('aria-expanded', String(isOpen));
			main.addEventListener('click', () => toggle(node));
		} else {
			main.append(el('span', { class: 'chevron' }), icon('file'));
			main.addEventListener('click', () => handlers.openCourse(node.path));
		}
		main.append(el('span', { class: 'tree-label' }, nameOf(node)));

		const more = el('button', { type: 'button', class: 'tree-more', ariaLabel: `Actions pour ${nameOf(node)}` });
		more.append(icon('more'));
		more.addEventListener('click', () => openMenu(more, handlers.menuFor(node)));
		row.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			openMenu({ x: event.clientX, y: event.clientY }, handlers.menuFor(node));
		});

		row.append(main, more);
		if (filter === '') makeDraggable(row, node); // pas de rangement pendant une recherche

		const item = el('li', {}, row);
		item.dataset.path = node.path;
		if (isFolder && isOpen) {
			const children = renderList(node.items);
			if (node.items.length === 0) children.append(el('li', { class: 'tree-empty' }, 'Dossier vide'));
			item.append(children);
		}
		return item;
	}

	function renderList(nodes: TreeNode[]): HTMLUListElement {
		const list = el('ul');
		for (const node of nodes) {
			siblings.set(node.path, nodes);
			if (filter === '' || matches(node)) list.append(renderNode(node));
		}
		return list;
	}

	function render() {
		siblings.clear();
		const list = renderList(items);
		if (!list.hasChildNodes()) {
			list.append(el('li', { class: 'tree-empty' }, filter ? 'Aucun résultat' : 'Aucune page pour le moment'));
		}
		container.replaceChildren(list);
	}

	return {
		setItems(next: TreeNode[]) {
			items = next;
			render();
		},
		setCurrent(path: string | null) {
			currentPath = path;
			// Ouvre les dossiers parents pour que le cours courant soit visible.
			for (let folder = path ? parentOf(path) : ''; folder; folder = parentOf(folder)) collapsed.delete(folder);
			render();
		},
		setFilter(text: string) {
			filter = normalize(text.trim());
			render();
		},
	};
}
