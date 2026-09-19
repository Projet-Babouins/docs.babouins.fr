/** Petits composants d'interface : notifications, boîtes de dialogue, menus contextuels. */
import { icon, type IconName } from './icons';

/** Crée un élément. Le texte passe par `textContent` : jamais interprété comme du HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
	...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
	const { class: className, ...rest } = props;
	const element = Object.assign(document.createElement(tag), rest);
	if (className) element.className = className;
	element.append(...children);
	return element;
}

// --- Notifications -------------------------------------------------------

let toasts: HTMLElement | undefined;

export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
	toasts ??= document.body.appendChild(el('div', { class: 'toasts' }));
	const item = el('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
	toasts.append(item);
	setTimeout(() => item.remove(), kind === 'error' ? 7000 : 3500);
}

/** Exécute une action ; en cas d'échec, affiche l'erreur au lieu de la laisser filer. */
export async function run(action: () => Promise<unknown>): Promise<void> {
	try {
		await action();
	} catch (error) {
		toast(error instanceof Error ? error.message : String(error), 'error');
	}
}

// --- Boîtes de dialogue -----------------------------------------------------

interface DialogField {
	name: string;
	label: string;
	value?: string;
	hint?: string;
	required?: boolean;
	/** Longueur maximale ; 60 par défaut (un nom de dossier). */
	maxLength?: number;
}

interface DialogOptions {
	title: string;
	message?: string;
	fields?: DialogField[];
	confirmLabel: string;
	danger?: boolean;
}

/**
 * Ouvre une boîte de dialogue modale (élément <dialog> natif : focus piégé,
 * Échap pour fermer). Renvoie les valeurs saisies, ou `null` si annulé.
 */
export function openDialog(options: DialogOptions): Promise<Record<string, string> | null> {
	return new Promise((resolve) => {
		const inputs = (options.fields ?? []).map((field) => {
			const input = el('input', {
				name: field.name,
				value: field.value ?? '',
				required: field.required ?? false,
				maxLength: field.maxLength ?? 60,
				autocomplete: 'off',
			});
			const label = el('label', {}, field.label, input);
			if (field.hint) label.append(el('small', {}, field.hint));
			return { input, label };
		});

		const cancel = el('button', { type: 'button', class: 'btn' }, 'Annuler');
		const confirm = el(
			'button',
			{ type: 'submit', class: `btn ${options.danger ? 'danger-solid' : 'primary'}` },
			options.confirmLabel,
		);
		const form = el(
			'form',
			{ method: 'dialog' },
			el('h2', {}, options.title),
			...(options.message ? [el('p', {}, options.message)] : []),
			...inputs.map(({ label }) => label),
			el('div', { class: 'dialog-actions' }, cancel, confirm),
		);
		const dialog = document.body.appendChild(el('dialog', { class: 'dialog' }, form));

		let result: Record<string, string> | null = null;
		cancel.addEventListener('click', () => dialog.close());
		form.addEventListener('submit', () => {
			result = Object.fromEntries(inputs.map(({ input }) => [input.name, input.value.trim()]));
		});
		dialog.addEventListener('close', () => {
			dialog.remove();
			resolve(result);
		});

		dialog.showModal();
		inputs[0]?.input.select();
	});
}

export const confirmDialog = async (options: Omit<DialogOptions, 'fields'>) => (await openDialog(options)) !== null;

// --- Menus contextuels -----------------------------------------------------

export interface MenuItem {
	label: string;
	icon: IconName;
	danger?: boolean;
	action: () => void;
}

let closeCurrentMenu: (() => void) | undefined;

/** Ouvre un menu à la position donnée (clic droit) ou sous un bouton. */
export function openMenu(anchor: { x: number; y: number } | HTMLElement, items: MenuItem[]): void {
	closeCurrentMenu?.();

	const menu = el('div', { class: 'menu', role: 'menu' });
	for (const item of items) {
		const button = el('button', { type: 'button', role: 'menuitem', class: item.danger ? 'danger' : '' });
		button.append(icon(item.icon), item.label);
		button.addEventListener('click', () => {
			close();
			item.action();
		});
		menu.append(button);
	}
	document.body.append(menu);

	// Placement : sous le bouton ou au point cliqué, sans sortir de la fenêtre.
	const point =
		anchor instanceof HTMLElement
			? { x: anchor.getBoundingClientRect().left, y: anchor.getBoundingClientRect().bottom + 4 }
			: anchor;
	menu.style.left = `${Math.max(8, Math.min(point.x, innerWidth - menu.offsetWidth - 8))}px`;
	menu.style.top = `${Math.max(8, Math.min(point.y, innerHeight - menu.offsetHeight - 8))}px`;

	const onPointerDown = (event: Event) => {
		if (!menu.contains(event.target as Node)) close();
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') close();
	};
	function close() {
		menu.remove();
		document.removeEventListener('pointerdown', onPointerDown, true);
		document.removeEventListener('keydown', onKeyDown, true);
		window.removeEventListener('blur', close);
		closeCurrentMenu = undefined;
	}
	closeCurrentMenu = close;
	document.addEventListener('pointerdown', onPointerDown, true);
	document.addEventListener('keydown', onKeyDown, true);
	window.addEventListener('blur', close);
	menu.querySelector('button')?.focus();
}
