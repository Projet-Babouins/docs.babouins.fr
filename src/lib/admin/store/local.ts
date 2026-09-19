import { mkdir, readdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { COURSES_DIR, MEDIA_DIR } from '../paths';
import type { ContentStore } from './types';

/** Racine du projet : le serveur de dev est lancé depuis ce dossier. */
const ROOT = process.cwd();
const coursesRoot = path.join(ROOT, COURSES_DIR);

/** Seuls dossiers où l'admin a le droit d'écrire. */
const WRITABLE_ROOTS = [COURSES_DIR, MEDIA_DIR].map((folder) => path.join(ROOT, folder));

/**
 * Chemin absolu d'un fichier du projet. Dernier filet de sécurité : même si un
 * chemin invalide arrivait jusqu'ici, il ne peut pas sortir des dossiers autorisés.
 */
function absolute(relativePath: string): string {
	const file = path.resolve(ROOT, relativePath);
	if (!WRITABLE_ROOTS.some((root) => file === root || file.startsWith(root + path.sep))) {
		throw new Error(`Chemin hors des dossiers autorisés : ${relativePath}`);
	}
	return file;
}

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

/** Supprime les dossiers devenus vides, en remontant jusqu'au dossier des cours. */
async function pruneEmptyFolders(from: string): Promise<void> {
	let folder = from;
	while (folder.startsWith(coursesRoot + path.sep)) {
		const entries = await readdir(folder).catch(() => null);
		if (entries === null || entries.length > 0) return;
		await rmdir(folder);
		folder = path.dirname(folder);
	}
}

/** Contenu brut d'un fichier, ou `null` s'il n'existe pas. */
async function load(relativePath: string): Promise<Buffer | null> {
	try {
		return await readFile(absolute(relativePath));
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
}

/** Stockage sur le disque local. Pas de commit : git reste à la main. */
export const localStore: ContentStore = {
	async list(folder) {
		const root = absolute(folder);
		const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
		return entries
			.filter((entry) => entry.isFile())
			.map((entry) => path.relative(ROOT, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, '/'));
	},

	async read(relativePath) {
		return (await load(relativePath))?.toString('utf8') ?? null;
	},

	readBytes: load,

	async commit(changes) {
		const emptied = new Set<string>();
		for (const change of changes) {
			const file = absolute(change.path);
			if (change.content === null) {
				await unlink(file).catch((error) => {
					if (!isMissing(error)) throw error;
				});
				emptied.add(path.dirname(file));
				continue;
			}
			await mkdir(path.dirname(file), { recursive: true });
			if (change.from) {
				await rename(absolute(change.from), file);
				emptied.add(path.dirname(absolute(change.from)));
			}
			if (change.content !== undefined) await writeFile(file, change.content);
		}
		for (const folder of emptied) await pruneEmptyFolders(folder);
	},
};
