/**
 * Contrat de stockage. Volontairement bas niveau : lister, lire, et appliquer
 * un lot de changements d'un coup. Toute la logique métier (cours, dossiers,
 * menu) vit au-dessus, dans library.ts, et ne dépend pas du stockage choisi :
 * - `local`  écrit directement sur le disque (développement) ;
 * - `github` fait un commit par lot via l'API GitHub, sur la branche d'une proposition
 *   ou directement sur `main` (production).
 */

/** Un changement sur un fichier. Les chemins sont relatifs à la racine du projet. */
export interface FileChange {
	path: string;
	/** Nouveau contenu ; `null` = suppression ; absent = déplacement seul (avec `from`). */
	content?: string | Uint8Array | null;
	/** Chemin d'origine, pour un déplacement. */
	from?: string;
}

/** Auteur de la modification (devient l'auteur du commit avec GitHub). */
export interface Author {
	name: string;
	email: string;
}

export interface CommitOptions {
	author: Author;
	message: string;
}

export interface ContentStore {
	/** Chemins de tous les fichiers d'un dossier, sous-dossiers compris. */
	list(folder: string): Promise<string[]>;
	/** Contenu texte d'un fichier, ou `null` s'il n'existe pas. */
	read(path: string): Promise<string | null>;
	/** Contenu brut d'un fichier (image), ou `null` s'il n'existe pas. */
	readBytes(path: string): Promise<Uint8Array | null>;
	/** Applique tous les changements ensemble (un seul commit avec GitHub). */
	commit(changes: FileChange[], options: CommitOptions): Promise<void>;
}

/** Qui modifie, et où ses modifications sont enregistrées. */
export interface Editor {
	store: ContentStore;
	/** Devient l'auteur du commit. */
	author: Author;
}
