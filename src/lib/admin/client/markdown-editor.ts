/**
 * Éditeur du contenu d'un cours. Deux modes sur le même texte Markdown :
 * - « visuel »  : Milkdown Crepe, un éditeur façon traitement de texte qui lit
 *   et écrit du Markdown (https://milkdown.dev) ;
 * - « source »  : le Markdown brut, pour ce que l'éditeur visuel ne sait pas faire.
 */
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import { mediaPreviewUrl } from '../paths';

export type EditorMode = 'visual' | 'source';

interface EditorOptions {
	host: HTMLElement;
	source: HTMLTextAreaElement;
	onChange: () => void;
	upload: (file: File) => Promise<string>;
}

/**
 * Crepe écrit `<br />` pour chaque ligne vide laissée dans le document. On les
 * retire : dans un cours, l'espacement vient de la mise en page, pas de lignes vides.
 */
const clean = (markdown: string) =>
	altFromCaption(markdown.replace(/^<br\s*\/?>\s*$/gm, '').replace(/\n{3,}/g, '\n\n'));

/**
 * Images. Crepe range la légende dans le titre Markdown et écrit un nombre (la taille
 * affichée dans l'éditeur) à la place du texte alternatif : `![1.00](url "légende")`.
 * Or ce texte est celui que lisent les lecteurs d'écran sur le site : on y remet la légende.
 */
const IMAGE = /!\[([^\]\n]*)\]\(([^)\s]+)(?: "([^"\n]*)")?\)/g;
const isSize = (alt: string) => /^\d+(\.\d+)?$/.test(alt);

/** En sortie de l'éditeur : `![1.00](url "légende")` → `![légende](url "légende")`. */
function altFromCaption(markdown: string): string {
	return markdown.replace(IMAGE, (image: string, alt: string, url: string, caption = '') => {
		if (!isSize(alt)) return image;
		const safeAlt = /[[\]]/.test(caption) ? '' : caption; // des crochets casseraient la syntaxe
		return `![${safeAlt}](${url}${caption ? ` "${caption}"` : ''})`;
	});
}

/** En entrée : `![texte](url)` → `![texte](url "texte")`, pour retrouver ce texte comme légende. */
function captionFromAlt(markdown: string): string {
	return markdown.replace(IMAGE, (image: string, alt: string, url: string, caption?: string) =>
		caption === undefined && alt && !isSize(alt) ? `![${alt}](${url} "${alt}")` : image,
	);
}

/**
 * Afficheur en lecture seule, pour relire une page proposée : le même rendu que
 * l'éditeur, sans barre d'outils. Les images sont lues dans la proposition relue.
 */
export function createMarkdownViewer(host: HTMLElement) {
	let crepe: Crepe | undefined;
	return {
		async show(markdown: string, proposal: number) {
			await crepe?.destroy();
			host.replaceChildren();
			crepe = new Crepe({
				root: host,
				defaultValue: captionFromAlt(markdown),
				features: {
					[Crepe.Feature.Latex]: false,
					[Crepe.Feature.BlockEdit]: false,
					[Crepe.Feature.Toolbar]: false,
					[Crepe.Feature.Placeholder]: false,
				},
				featureConfigs: {
					[Crepe.Feature.ImageBlock]: { proxyDomURL: (url: string) => mediaPreviewUrl(url, proposal) },
				},
			});
			await crepe.create();
			crepe.setReadonly(true);
		},
		async clear() {
			await crepe?.destroy();
			crepe = undefined;
			host.replaceChildren();
		},
	};
}

export function createMarkdownEditor({ host, source, onChange, upload }: EditorOptions) {
	let crepe: Crepe | undefined;
	let mode: EditorMode = 'visual';

	source.addEventListener('input', onChange);

	async function mountVisual(markdown: string) {
		crepe = new Crepe({
			root: host,
			defaultValue: captionFromAlt(markdown),
			features: {
				[Crepe.Feature.TopBar]: true, // barre d'outils fixe, comme un traitement de texte
				[Crepe.Feature.Latex]: false,
			},
			featureConfigs: {
				[Crepe.Feature.Placeholder]: { text: 'Écris ton cours ici… Tape « / » pour insérer un bloc.' },
				[Crepe.Feature.ImageBlock]: {
					proxyDomURL: mediaPreviewUrl, // image pas encore en ligne : affichée via l'API admin
					onUpload: upload,
					inlineOnUpload: upload,
					blockOnUpload: upload,
					inlineUploadButton: 'Envoyer',
					inlineUploadPlaceholderText: 'ou coller un lien',
					inlineConfirmButton: 'OK',
					blockUploadButton: 'Envoyer une image',
					blockUploadPlaceholderText: 'ou coller un lien',
					blockConfirmButton: 'OK',
					blockCaptionPlaceholderText: 'Légende de l’image',
				},
				[Crepe.Feature.TopBar]: {
					// Pas de « Titre 1 » : c'est le titre du cours, saisi au-dessus.
					headingOptions: [
						{ label: 'Paragraphe', level: null },
						{ label: 'Titre', level: 2 },
						{ label: 'Sous-titre', level: 3 },
						{ label: 'Petit titre', level: 4 },
					],
				},
				[Crepe.Feature.BlockEdit]: {
					textGroup: {
						label: 'Texte',
						text: { label: 'Paragraphe' },
						h1: null,
						h2: { label: 'Titre' },
						h3: { label: 'Sous-titre' },
						h4: { label: 'Petit titre' },
						h5: null,
						h6: null,
						quote: { label: 'Citation' },
						divider: { label: 'Séparateur' },
					},
					listGroup: {
						label: 'Listes',
						bulletList: { label: 'Liste à puces' },
						orderedList: { label: 'Liste numérotée' },
						taskList: { label: 'Liste de tâches' },
					},
					advancedGroup: {
						label: 'Blocs',
						image: { label: 'Image' },
						codeBlock: { label: 'Bloc de code' },
						table: { label: 'Tableau' },
					},
				},
				[Crepe.Feature.CodeMirror]: {
					searchPlaceholder: 'Chercher un langage',
					noResultText: 'Aucun résultat',
					copyText: 'Copier',
				},
			},
		});
		await crepe.create();
		// Crepe signale aussi sa propre remise en forme du texte au chargement :
		// seul un texte différent de celui chargé compte comme une modification.
		const loaded = clean(crepe.getMarkdown());
		crepe.on((listener) =>
			listener.markdownUpdated((_ctx, markdown) => {
				if (clean(markdown) !== loaded) onChange();
			}),
		);
	}

	async function unmountVisual() {
		await crepe?.destroy();
		crepe = undefined;
		host.replaceChildren();
	}

	const getMarkdown = () => (crepe ? clean(crepe.getMarkdown()) : source.value);

	async function show(markdown: string, nextMode: EditorMode) {
		await unmountVisual();
		mode = nextMode;
		host.hidden = mode !== 'visual';
		source.hidden = mode !== 'source';
		if (mode === 'visual') await mountVisual(markdown);
		else source.value = markdown;
	}

	return {
		getMarkdown,
		get mode() {
			return mode;
		},
		/** Charge un autre texte (changement de cours). */
		load: (markdown: string) => show(markdown, mode),
		/** Bascule visuel ↔ source en gardant le texte en cours. */
		setMode: (nextMode: EditorMode) => (nextMode === mode ? Promise.resolve() : show(getMarkdown(), nextMode)),
		focus() {
			if (mode === 'source') source.focus();
			else host.querySelector<HTMLElement>('.ProseMirror')?.focus();
		},
	};
}
