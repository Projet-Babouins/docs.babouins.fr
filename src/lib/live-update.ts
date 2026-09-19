/**
 * Mise à jour douce des pages ouvertes.
 *
 * Quand un cours est enregistré, le site est reconstruit. Un lecteur qui a déjà la page
 * ouverte ne verrait rien sans recharger. Ce script vérifie donc de temps en temps si une
 * nouvelle version du site est en ligne, puis remplace seulement ce qui a changé (le
 * contenu du cours, le menu), sans recharger la page et sans perdre la position de lecture.
 *
 * Trois empreintes sont écrites dans chaque page au build par components/Head.astro :
 *  - babouins:build  identifiant du build, le même pour tout le site ;
 *  - babouins:page   contenu de cette page ;
 *  - babouins:nav    menu de gauche (les liens précédent / suivant en dépendent aussi).
 * La page « introuvable » porte en plus babouins:missing : elle se recharge quand l'adresse existe.
 *
 * En développement, le serveur Astro recharge déjà les pages : ce script ne fait rien.
 */

const CHECK_EVERY_MS = 60_000;
const NOTICE_MS = 6_000;

const SIDEBAR = 'sl-sidebar-state-persist';
const MAIN = '.main-frame';
const PAGINATION = '.pagination-links';

type Prints = { build: string; page: string; nav: string };

const meta = (doc: Document, name: string) =>
	doc.querySelector<HTMLMetaElement>(`meta[name="babouins:${name}"]`)?.content ?? '';

const readPrints = (doc: Document): Prints => ({
	build: meta(doc, 'build'),
	page: meta(doc, 'page'),
	nav: meta(doc, 'nav'),
});

let current = readPrints(document);
let checking = false;
let stopped = false;

/** Le site a-t-il été reconstruit depuis le chargement de cette page ? */
async function check(): Promise<void> {
	if (stopped || checking || document.visibilityState !== 'visible') return;
	checking = true;
	try {
		const response = await fetch('/version.json', { cache: 'no-store' });
		const { build } = (await response.json()) as { build: string };
		if (build !== current.build) await update(build);
	} catch {
		// Réseau coupé ou serveur en cours de redémarrage : on réessaiera au prochain tour.
	} finally {
		checking = false;
	}
}

/** Télécharge la nouvelle version de la page et remplace les zones qui ont changé. */
async function update(build: string): Promise<void> {
	const response = await fetch(location.pathname, { cache: 'no-store' });

	// Cas de la page « introuvable » : un cours tout juste créé, ouvert avant sa mise en ligne.
	// Personne ne lit une page 404 : dès que l'adresse existe, on recharge pour de bon.
	if (meta(document, 'missing')) {
		if (response.ok) location.reload();
		else current.build = build; // toujours rien à cette adresse : on attend le prochain build
		return;
	}

	if (response.status === 404) {
		return stop('Cette page a été déplacée ou supprimée.', "Retour à l'accueil", () => location.assign('/'));
	}
	if (!response.ok) return;

	// DOMParser n'exécute aucun script : le document obtenu est inerte.
	const next = new DOMParser().parseFromString(await response.text(), 'text/html');
	const incoming = readPrints(next);
	// Déploiement pas terminé : version.json est déjà en ligne, mais pas encore cette page.
	if (!incoming.build || incoming.build === current.build) return;

	const pageChanged = incoming.page !== current.page;
	const navChanged = incoming.nav !== current.nav;
	// Rien de visible n'a changé ici (c'est un autre cours qui a été modifié) : on note le build, sans bruit.
	if (!pageChanged && !navChanged) {
		current = incoming;
		return;
	}
	const anchor = readingAnchor();

	let done = !needsNewAssets(next);
	if (done && navChanged) done = swapSidebar(next);
	if (done && pageChanged) done = swap(next, MAIN);
	if (done && navChanged && !pageChanged) done = swap(next, PAGINATION);
	if (!done) {
		return stop('Une nouvelle version de cette page est disponible.', 'Recharger', () => location.reload());
	}

	if (pageChanged) {
		document.title = next.title;
		for (const flag of ['data-has-toc', 'data-has-hero']) {
			document.documentElement.toggleAttribute(flag, next.documentElement.hasAttribute(flag));
		}
		restoreReading(anchor);
		document.querySelector('main')?.classList.add('live-updated');
		notify("Cette page vient d'être mise à jour.");
	}
	current = incoming;
}

/**
 * La nouvelle version a-t-elle besoin d'un style ou d'un script absent de cette page ?
 * (premier bloc de code d'un cours, nouvelle version du code du site…) Les scripts insérés
 * après coup ne s'exécutent pas : dans ce cas, seul un vrai rechargement est fiable.
 */
function needsNewAssets(next: Document): boolean {
	const assets = (doc: Document) =>
		[...doc.querySelectorAll('link[rel="stylesheet"], style, script')].map(
			(node) => node.getAttribute('href') ?? node.getAttribute('src') ?? node.textContent ?? '',
		);
	const known = new Set(assets(document));
	return assets(next).some((asset) => !known.has(asset));
}

/** Remplace le contenu d'une zone de la page par celui de la nouvelle version. */
function swap(next: Document, selector: string): boolean {
	const from = next.querySelector(selector);
	const to = document.querySelector(selector);
	if (!from && !to) return true; // zone absente des deux côtés (page sans menu, par exemple)
	if (!from || !to) return false;
	for (const { name, value } of Array.from(from.attributes)) to.setAttribute(name, value);
	to.replaceChildren(...from.childNodes);
	return true;
}

/** Remplace le menu en gardant ouverts ou fermés les dossiers que le lecteur a touchés. */
function swapSidebar(next: Document): boolean {
	const groups = (doc: Document) => [...doc.querySelectorAll<HTMLDetailsElement>(`${SIDEBAR} details`)];
	const wasOpen = new Map(groups(document).map((group) => [groupKey(group), group.open]));
	// État prévu par le serveur, lu avant l'insertion : une fois dans la page, Starlight peut le modifier.
	const planned = new Map(groups(next).map((group) => [group, group.open]));
	if (!swap(next, SIDEBAR)) return false;
	for (const [group, open] of planned) group.open = wasOpen.get(groupKey(group)) ?? open;
	return true;
}

/** Nom complet d'un dossier du menu (« Réseau / TP »), pour le retrouver après la mise à jour. */
function groupKey(group: HTMLDetailsElement): string {
	const labels: string[] = [];
	for (let node: Element | null = group; node; node = node.parentElement?.closest('details') ?? null) {
		labels.unshift(node.querySelector('summary')?.textContent?.trim() ?? '');
	}
	return labels.join(' / ');
}

type Anchor = { id: string; top: number } | null;

/** Dernier titre passé au-dessus du milieu de l'écran : le repère de lecture. */
function readingAnchor(): Anchor {
	const headings = [...document.querySelectorAll<HTMLElement>('main :is(h1, h2, h3, h4, h5, h6)[id]')];
	const heading = headings.findLast((h) => h.getBoundingClientRect().top < innerHeight / 2) ?? headings[0];
	return heading ? { id: heading.id, top: heading.getBoundingClientRect().top } : null;
}

/** Remet le repère de lecture à la même hauteur : le texte ajouté plus haut ne décale rien. */
function restoreReading(anchor: Anchor): void {
	const heading = anchor && document.getElementById(anchor.id);
	if (heading) scrollBy(0, heading.getBoundingClientRect().top - anchor.top);
}

let notice: HTMLElement | undefined;

/** Petit message en bas de l'écran. Sans bouton, il disparaît tout seul. */
function notify(message: string, actionLabel?: string, action?: () => void): void {
	notice?.remove();
	const box = document.createElement('div');
	box.className = 'live-update-notice';
	box.setAttribute('role', 'status');
	box.textContent = message;
	if (actionLabel && action) {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = actionLabel;
		button.addEventListener('click', action);
		box.append(button);
	} else {
		setTimeout(() => box.remove(), NOTICE_MS);
	}
	document.body.append(box);
	notice = box;
}

/** Mise à jour douce impossible : on prévient le lecteur, il choisit quand agir. */
function stop(message: string, actionLabel: string, action: () => void): void {
	stopped = true;
	notify(message, actionLabel, action);
}

if (!import.meta.env.DEV && current.build) {
	setInterval(check, CHECK_EVERY_MS);
	document.addEventListener('visibilitychange', check);
}
