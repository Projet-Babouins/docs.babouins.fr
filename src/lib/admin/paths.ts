/**
 * Identifiants de cours et chemins de fichiers.
 *
 * Un cours est identifié par son chemin relatif au dossier des cours, sans
 * extension : `reseaux/modele-osi` ↔ `src/content/docs/cours/reseaux/modele-osi.md`.
 * Un dossier est identifié de la même façon (`reseaux/tcp-ip`) ; la racine est ''.
 * Toute entrée utilisateur passe par ce fichier avant de toucher au stockage.
 *
 * Ce module ne dépend pas de Node : il est aussi utilisé dans le navigateur.
 */

/** Dossier des cours, relatif à la racine du projet. */
export const COURSES_DIR = 'src/content/docs/cours';
/** Ordre et noms affichés des dossiers et des cours (voir menu.ts). */
export const MENU_FILE = `${COURSES_DIR}/_menu.json`;
/** Dossier des images envoyées depuis l'éditeur, et son URL publique. */
export const MEDIA_DIR = 'public/media';
export const MEDIA_URL = '/media';
/** Préfixe des URL publiques des cours. */
export const COURSES_URL = '/cours';

const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Profondeur maximale d'un cours : 5 dossiers + le fichier. */
export const MAX_DEPTH = 6;
const MAX_SEGMENT_LENGTH = 60;

/** « Modèle OSI & TCP/IP » → « modele-osi-tcp-ip ». */
export function slugify(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // accents
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_SEGMENT_LENGTH)
		.replace(/-+$/, '');
}

/** Vrai pour un nom de fichier ou de dossier sûr : minuscules, chiffres et tirets. */
export const isValidSlug = (slug: string) => slug.length <= MAX_SEGMENT_LENGTH && SEGMENT.test(slug);

const hasValidSegments = (path: string, maxDepth: number) => {
	const segments = path.split('/');
	return segments.length <= maxDepth && segments.every(isValidSlug);
};

/**
 * Vrai si l'identifiant est sûr : segments en minuscules, chiffres et tirets.
 * Interdit donc `..`, les chemins absolus et les caractères spéciaux.
 */
export const isValidCourseId = (id: string) => hasValidSegments(id, MAX_DEPTH);

/** Comme un cours, avec un niveau de moins ; '' désigne la racine. */
export const isValidFolderPath = (path: string) => path === '' || hasValidSegments(path, MAX_DEPTH - 1);

export const joinPath = (folder: string, slug: string) => (folder ? `${folder}/${slug}` : slug);
export const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');
export const slugOf = (path: string) => path.split('/').at(-1) ?? '';

/** Chemin du fichier Markdown d'un cours, relatif à la racine du projet. */
export function courseFilePath(id: string): string {
	if (!isValidCourseId(id)) throw new Error(`Identifiant de cours invalide : ${id}`);
	return `${COURSES_DIR}/${id}.md`;
}

/** URL publique de la page d'un cours. */
export const courseUrl = (id: string) => `${COURSES_URL}/${id}/`;

/** Type des images acceptées, d'après l'extension que upload.ts leur a donnée. */
export const MEDIA_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Vrai pour un nom d'image tel que upload.ts les fabrique : `schema-reseau-3fa9c1.png`. */
export function isValidMediaName(name: string): boolean {
	const [base = '', extension = '', ...rest] = name.split('.');
	return rest.length === 0 && isValidSlug(base) && Object.hasOwn(MEDIA_TYPES, extension);
}

/**
 * Adresse pour AFFICHER une image dans l'éditeur. Une image envoyée n'est en ligne sur
 * `/media/…` qu'après la reconstruction du site : en attendant, l'éditeur la demande à
 * l'API admin, qui la lit dans le stockage. Le Markdown, lui, garde l'adresse publique.
 * Avec `proposal`, l'image est lue dans cette proposition (pendant une relecture).
 */
export function mediaPreviewUrl(url: string, proposal?: number): string {
	const name = url.startsWith(`${MEDIA_URL}/`) ? url.slice(MEDIA_URL.length + 1) : '';
	if (!isValidMediaName(name)) return url;
	return `/api/admin/media?file=${name}${proposal ? `&proposal=${proposal}` : ''}`;
}
