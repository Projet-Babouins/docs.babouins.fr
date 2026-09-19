/**
 * Script de la page /admin (exécuté dans le navigateur) : relie l'arborescence,
 * le formulaire du cours et l'éditeur. Il ne parle qu'à l'API /api/admin ;
 * aucune règle de sécurité ne vit ici.
 */
import { COURSES_URL, parentOf, slugOf, slugify } from '../paths';
import { api, type Course, type Me, type TreeFolder, type TreeNode } from './api';
import { hydrateIcons, icon } from './icons';
import { createMarkdownEditor, type EditorMode } from './markdown-editor';
import { createReviews } from './reviews';
import { createTree } from './tree';
import { confirmDialog, el, openDialog, openMenu, run, toast, type MenuItem } from './ui';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const welcome = $('#welcome');
const doc = $<HTMLFormElement>('#doc');
const reviewsPanel = $('#reviews');
const modeBanner = $('#mode-banner');
const titleInput = $<HTMLInputElement>('#title');
const descriptionInput = $<HTMLInputElement>('#description');
const slugInput = $<HTMLInputElement>('#slug');
const urlPrefix = $('#url-prefix');
const folderSelect = $<HTMLSelectElement>('#folder');
const statusPill = $('#status');
const viewLink = $<HTMLAnchorElement>('#view');
const saveButton = $<HTMLButtonElement>('#save');

const NEW_FOLDER = '\0new'; // valeur de l'option « Nouveau dossier… » de la liste

let items: TreeNode[] = [];
/** Cours ouvert ; `null` = nouveau cours pas encore enregistré. */
let current: { id: string; version: string } | null = null;
let dirty = false;
/** Tant que le nom de fichier n'a pas été modifié à la main, il suit le titre. */
let slugFollowsTitle = false;
let selectedFolder = '';
/** Qui est connecté, et où partent ses enregistrements (proposition ou publication directe). */
let me: Me;

const editor = createMarkdownEditor({
	host: $('#editor'),
	source: $<HTMLTextAreaElement>('#source'),
	onChange: markDirty,
	upload: api.upload,
});

const tree = createTree($('#tree'), {
	openCourse: (path) => run(() => openCourse(path)),
	menuFor,
	move: (path, targetFolder, before) =>
		run(async () => {
			const moved = await api.move(path, targetFolder, before);
			followRename(path, moved.path);
			await refreshTree();
		}),
});

const reviews = createReviews(reviewsPanel, {
	me: () => me,
	// Une proposition publiée, retirée ou mise à jour change ce que l'arbre doit montrer.
	onChange: async () => {
		await refreshMe();
		await refreshTree();
	},
});

// --- État -----------------------------------------------------------------

function setStatus(text: string, kind: '' | 'dirty' | 'saved' = '') {
	statusPill.textContent = text;
	statusPill.className = `status ${kind}`;
}

function markDirty() {
	if (dirty) return;
	dirty = true;
	setStatus('Modifications non enregistrées', 'dirty');
}

// --- Où partent les enregistrements ------------------------------------------------

async function refreshMe() {
	me = await api.me();
	const button = (label: string, action: () => void) => {
		const node = el('button', { type: 'button', class: 'btn' }, label);
		node.addEventListener('click', action);
		return node;
	};

	const proposal = me.proposal;
	if (me.direct) {
		modeBanner.className = 'mode-banner warn';
		modeBanner.replaceChildren(
			icon('direct'),
			el('span', {}, `Publication directe : tes enregistrements sont mis en ligne sans relecture. Raison : ${me.direct.reason}`),
			button('Revenir aux propositions', () => run(() => setDirect(null))),
		);
	} else if (proposal) {
		modeBanner.className = `mode-banner ${proposal.changesRequested ? 'warn' : ''}`;
		modeBanner.replaceChildren(
			icon('review'),
			el(
				'span',
				{},
				`Ta proposition est en relecture : ${proposal.approvals}/${proposal.required} validations`,
				proposal.changesRequested ? ', et des corrections sont demandées.' : '. Tes prochains enregistrements la complètent.',
			),
			button('Voir', () => run(() => openReviews(proposal.number))),
		);
	}
	modeBanner.hidden = !me.direct && !proposal;
	document.querySelector('#toggle-direct')?.setAttribute('aria-pressed', String(Boolean(me.direct)));
}

async function setDirect(reason: string | null) {
	await api.setDirect(reason);
	await refreshMe();
	// Le référent ne lit plus la même chose : sa proposition d'un côté, le site publié de l'autre.
	await refreshTree();
	toast(reason === null ? 'Tes enregistrements repartent en proposition.' : 'Publication directe activée.');
}

async function toggleDirect() {
	if (me.direct) return setDirect(null);
	const values = await openDialog({
		title: 'Publier sans relecture ?',
		message:
			'Réservé aux urgences. Jusqu’à ta déconnexion, chaque enregistrement sera mis en ligne tout de suite, sans les validations. Ta raison est écrite dans l’historique, à ton nom.',
		fields: [{ name: 'reason', label: 'Raison', required: true, maxLength: 200, hint: 'Exemple : erreur gênante à corriger avant le TP de demain.' }],
		confirmLabel: 'Activer',
		danger: true,
	});
	if (values) await setDirect(values.reason);
}

/** Texte affiché après un enregistrement réussi : il dit où le travail est parti. */
function savedStatus(): string {
	if (me.local) return 'Enregistré';
	if (me.direct) return 'Publié · en ligne dans quelques minutes';
	return me.proposal ? `Proposition envoyée · ${me.proposal.approvals}/${me.proposal.required} validations` : 'Enregistré';
}

async function refreshReviewsCount() {
	const count = $('#reviews-count');
	// Celles des autres : ce sont elles qui attendent un avis de la personne connectée.
	const waiting = (await api.proposals()).filter((proposal) => !proposal.mine).length;
	count.textContent = String(waiting);
	count.hidden = waiting === 0;
}

async function openReviews(number?: number) {
	if (!(await confirmLeave())) return;
	closeDocument();
	welcome.hidden = true;
	reviewsPanel.hidden = false;
	document.body.classList.remove('sidebar-open');
	await reviews.open(number);
}

function closeReviews() {
	reviewsPanel.hidden = true;
	welcome.hidden = !doc.hidden;
}

const confirmLeave = async () =>
	!dirty ||
	(await confirmDialog({
		title: 'Abandonner les modifications ?',
		message: 'Ce cours a des modifications non enregistrées. Elles seront perdues.',
		confirmLabel: 'Abandonner',
		danger: true,
	}));

/** Tous les dossiers de l'arbre, à plat, avec leur profondeur. */
function allFolders(nodes: TreeNode[] = items, depth = 0): { folder: TreeFolder; depth: number }[] {
	return nodes.flatMap((node) =>
		node.type === 'folder' ? [{ folder: node, depth }, ...allFolders(node.items, depth + 1)] : [],
	);
}

function renderFolderSelect() {
	const indent = '   ';
	folderSelect.replaceChildren(
		new Option('Racine (aucun dossier)', ''),
		...allFolders().map(({ folder, depth }) => new Option(indent.repeat(depth) + folder.label, folder.path)),
		new Option('＋ Nouveau dossier…', NEW_FOLDER),
	);
	folderSelect.value = selectedFolder;
	urlPrefix.textContent = `${COURSES_URL}/${selectedFolder ? `${selectedFolder}/` : ''}`;
}

async function refreshTree() {
	items = await api.tree();
	tree.setItems(items);
	renderFolderSelect();
}

function syncAddressBar() {
	const url = new URL(location.href);
	if (current) url.searchParams.set('cours', current.id);
	else url.searchParams.delete('cours');
	history.replaceState(null, '', url);
}

/** Un cours ou un de ses dossiers a changé de chemin : le cours ouvert suit. */
function followRename(fromPath: string, toPath: string) {
	if (!current || fromPath === toPath) return;
	if (current.id !== fromPath && !current.id.startsWith(`${fromPath}/`)) return;
	current.id = toPath + current.id.slice(fromPath.length);
	selectedFolder = parentOf(current.id);
	slugInput.value = slugOf(current.id);
	viewLink.href = `${COURSES_URL}/${current.id}/`;
	tree.setCurrent(current.id);
	syncAddressBar();
}

// --- Cours ----------------------------------------------------------------

/** Affiche un cours dans l'éditeur ; un objet vide = nouveau cours. */
async function showDocument(course: Partial<Course>, folder: string) {
	titleInput.value = course.title ?? '';
	descriptionInput.value = course.description ?? '';
	slugInput.value = course.id ? slugOf(course.id) : '';
	selectedFolder = folder;
	current = course.id && course.version ? { id: course.id, version: course.version } : null;
	slugFollowsTitle = current === null;
	dirty = false;

	viewLink.hidden = current === null;
	if (course.url) viewLink.href = course.url;
	$('#doc-menu').hidden = current === null;
	welcome.hidden = reviewsPanel.hidden = true;
	doc.hidden = false;
	document.body.classList.remove('sidebar-open');
	setStatus(current ? '' : 'Nouveau cours');
	renderFolderSelect();
	tree.setCurrent(current?.id ?? null);
	syncAddressBar();
	await editor.load(course.body ?? '');
}

async function openCourse(id: string) {
	if (current?.id === id || !(await confirmLeave())) return;
	const course = await api.course(id);
	await showDocument(course, parentOf(course.id));
}

async function newCourse(folder: string) {
	if (!(await confirmLeave())) return;
	await showDocument({}, folder);
	titleInput.focus();
}

function closeDocument() {
	current = null;
	dirty = false;
	doc.hidden = true;
	welcome.hidden = false;
	tree.setCurrent(null);
	syncAddressBar();
}

async function save() {
	if (!titleInput.value.trim()) {
		titleInput.focus();
		throw new Error('Donne un titre au cours avant d’enregistrer.');
	}
	saveButton.disabled = true;
	setStatus('Enregistrement…');
	try {
		const saved = await api.saveCourse({
			originalId: current?.id ?? null,
			version: current?.version ?? null,
			folder: selectedFolder,
			slug: slugInput.value,
			title: titleInput.value,
			description: descriptionInput.value,
			body: editor.getMarkdown(),
		});
		// L'éditeur n'est pas rechargé : le curseur reste où il est.
		current = { id: saved.id, version: saved.version };
		slugInput.value = slugOf(saved.id);
		slugFollowsTitle = false;
		dirty = false;
		viewLink.href = saved.url;
		viewLink.hidden = $('#doc-menu').hidden = false;
		tree.setCurrent(saved.id);
		syncAddressBar();
		await Promise.all([refreshTree(), refreshMe()]);
		setStatus(savedStatus(), 'saved');
	} catch (error) {
		setStatus('Modifications non enregistrées', 'dirty');
		throw error;
	} finally {
		saveButton.disabled = false;
	}
}

async function deleteCourse(id: string, title: string) {
	const confirmed = await confirmDialog({
		title: 'Supprimer ce cours ?',
		message: `« ${title} » sera supprimé du site.`,
		confirmLabel: 'Supprimer',
		danger: true,
	});
	if (!confirmed) return;
	await api.deleteCourse(id);
	if (current?.id === id) closeDocument();
	await refreshTree();
	toast('Cours supprimé.');
}

// --- Dossiers ---------------------------------------------------------------

async function newFolder(parent: string): Promise<string | null> {
	const values = await openDialog({
		title: 'Nouveau dossier',
		fields: [{ name: 'label', label: 'Nom du dossier', required: true }],
		confirmLabel: 'Créer',
	});
	if (!values) return null;
	const { path } = await api.createFolder(parent, values.label);
	await refreshTree();
	return path;
}

async function renameFolder(folder: TreeFolder) {
	const values = await openDialog({
		title: 'Renommer le dossier',
		fields: [
			{ name: 'label', label: 'Nom du dossier', value: folder.label, required: true },
			{
				name: 'slug',
				label: 'Adresse',
				value: slugOf(folder.path),
				hint: 'Partie de l’URL. La changer modifie l’adresse de tous les cours du dossier.',
			},
		],
		confirmLabel: 'Renommer',
	});
	if (!values) return;
	const updated = await api.updateFolder(folder.path, values.label, values.slug);
	followRename(folder.path, updated.path);
	await refreshTree();
}

const countCourses = (node: TreeNode): number =>
	node.type === 'course' ? 1 : node.items.reduce((total, child) => total + countCourses(child), 0);

async function deleteFolder(folder: TreeFolder) {
	const count = countCourses(folder);
	const confirmed = await confirmDialog({
		title: 'Supprimer ce dossier ?',
		message:
			count === 0
				? `Le dossier « ${folder.label} » est vide.`
				: `Le dossier « ${folder.label} » et ses ${count} cours seront supprimés du site.`,
		confirmLabel: count === 0 ? 'Supprimer' : `Supprimer le dossier et ${count} cours`,
		danger: true,
	});
	if (!confirmed) return;
	await api.deleteFolder(folder.path);
	if (current && current.id.startsWith(`${folder.path}/`)) closeDocument();
	if (selectedFolder === folder.path || selectedFolder.startsWith(`${folder.path}/`)) selectedFolder = '';
	await refreshTree();
	toast('Dossier supprimé.');
}

function menuFor(node: TreeNode): MenuItem[] {
	if (node.type === 'course') {
		return [
			{ label: 'Ouvrir', icon: 'pencil', action: () => run(() => openCourse(node.path)) },
			{ label: 'Voir la page', icon: 'external', action: () => window.open(`${COURSES_URL}/${node.path}/`, '_blank') },
			{ label: 'Supprimer', icon: 'trash', danger: true, action: () => run(() => deleteCourse(node.path, node.title)) },
		];
	}
	return [
		{ label: 'Nouveau cours ici', icon: 'file-plus', action: () => run(() => newCourse(node.path)) },
		{ label: 'Nouveau sous-dossier', icon: 'folder-plus', action: () => run(() => newFolder(node.path)) },
		{ label: 'Renommer', icon: 'pencil', action: () => run(() => renameFolder(node)) },
		{ label: 'Supprimer', icon: 'trash', danger: true, action: () => run(() => deleteFolder(node)) },
	];
}

// --- Développement : pas de rechargement de l'éditeur ----------------------------
//
// Dès qu'un fichier de cours change, le serveur de dev demande à TOUTES les pages
// ouvertes de se recharger, pour montrer le résultat en direct. C'est pratique sur
// les pages du site, mais pas ici : l'éditeur se rechargeait juste après son propre
// enregistrement (écran qui clignote, curseur perdu). Vite attend la fin de cet
// écouteur avant de recharger : pour un changement de contenu, on ne répond jamais.
// Contrepartie : après ça, une modification du CODE de l'admin demande un F5.
// En production ce bloc n'existe pas (`import.meta.hot` est indéfini), et aucune
// page ne se recharge toute seule.
if (import.meta.hot) {
	import.meta.hot.on('vite:beforeFullReload', (payload) => {
		const isContentChange = payload.path === '*' && !payload.triggeredBy;
		return isContentChange ? new Promise<void>(() => {}) : undefined;
	});
}

// --- Événements -----------------------------------------------------------

hydrateIcons();

for (const button of document.querySelectorAll('[data-action="new-course"]')) {
	button.addEventListener('click', () => run(() => newCourse(doc.hidden ? '' : selectedFolder)));
}
$('#new-folder').addEventListener('click', () => run(() => newFolder('')));
$('#search').addEventListener('input', (event) => tree.setFilter((event.target as HTMLInputElement).value));
$('#toggle-sidebar').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
$('#welcome-menu').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
$('#reviews-menu').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
$('#reviews-close').addEventListener('click', closeReviews);
// Absents en stockage local (pas de relecture) et pour qui n'est pas référent.
document.querySelector('#open-reviews')?.addEventListener('click', () => run(() => openReviews()));
document.querySelector('#toggle-direct')?.addEventListener('click', () => run(toggleDirect));

doc.addEventListener('submit', (event) => {
	event.preventDefault();
	run(save);
});

titleInput.addEventListener('input', () => {
	if (slugFollowsTitle) slugInput.value = slugify(titleInput.value);
	markDirty();
});
titleInput.addEventListener('keydown', (event) => {
	if (event.key !== 'Enter') return;
	event.preventDefault();
	editor.focus();
});
descriptionInput.addEventListener('input', markDirty);
slugInput.addEventListener('input', () => {
	slugFollowsTitle = false;
	markDirty();
});
// Le nom de fichier est normalisé dès qu'on quitte le champ : ce qu'on voit est ce qui sera enregistré.
slugInput.addEventListener('change', () => {
	slugInput.value = slugify(slugInput.value);
	if (!slugInput.value && !current) slugFollowsTitle = true;
	if (slugFollowsTitle) slugInput.value = slugify(titleInput.value);
});

folderSelect.addEventListener('change', () =>
	run(async () => {
		if (folderSelect.value === NEW_FOLDER) {
			folderSelect.value = selectedFolder;
			const created = await newFolder(selectedFolder);
			if (created === null) return;
			selectedFolder = created;
		} else {
			selectedFolder = folderSelect.value;
		}
		renderFolderSelect();
		markDirty();
	}),
);

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
	button.addEventListener('click', () =>
		run(async () => {
			await editor.setMode(button.dataset.mode as EditorMode);
			for (const other of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
				other.setAttribute('aria-pressed', String(other === button));
			}
		}),
	);
}

$('#doc-menu').addEventListener('click', (event) => {
	if (!current) return;
	const { id } = current;
	openMenu(event.currentTarget as HTMLElement, [
		{ label: 'Supprimer le cours', icon: 'trash', danger: true, action: () => run(() => deleteCourse(id, titleInput.value)) },
	]);
});

document.addEventListener('keydown', (event) => {
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !doc.hidden) {
		event.preventDefault();
		doc.requestSubmit();
	}
});

window.addEventListener('beforeunload', (event) => {
	if (dirty) event.preventDefault();
});

run(async () => {
	await Promise.all([refreshMe(), refreshTree()]);
	if (!me.local) run(refreshReviewsCount); // sans attendre : ce compteur ne bloque rien
	const requested = new URL(location.href).searchParams.get('cours');
	if (requested) await openCourse(requested).catch(() => syncAddressBar());
});
