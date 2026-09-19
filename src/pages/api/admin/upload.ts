import { randomBytes } from 'node:crypto';
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { AdminError, editorOf, respond } from '../../../lib/admin/http';
import { MEDIA_DIR, MEDIA_URL, slugify } from '../../../lib/admin/paths';
import { imageMessage } from '../../../lib/admin/proposals';

export const prerender = false;

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_WIDTH = 1600;
/** Formats acceptés. Pas de SVG : un SVG peut contenir du JavaScript. */
const EXTENSIONS: Record<string, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };

/** Reçoit une image de l'éditeur et renvoie son URL publique. */
export const POST: APIRoute = (context) =>
	respond(async () => {
		const file = (await context.request.formData().catch(() => null))?.get('file');
		if (!(file instanceof File)) throw new AdminError(400, 'Aucun fichier reçu.');
		if (file.size > MAX_BYTES) throw new AdminError(413, 'Image trop lourde (5 Mo maximum).');

		// Le vrai format est lu dans le contenu du fichier, pas dans son nom ni son type déclaré.
		// `rotate()` sans argument applique l'orientation EXIF (photos de téléphone) ;
		// le ré-encodage qui suit supprime les métadonnées, dont la position GPS.
		let image = sharp(await file.arrayBuffer()).rotate();
		const metadata = await image.metadata().catch(() => null);
		const extension = metadata?.format ? EXTENSIONS[metadata.format] : undefined;
		if (!metadata || !extension) throw new AdminError(415, 'Format non accepté : PNG, JPEG ou WebP uniquement.');
		if ((metadata.width ?? 0) > MAX_WIDTH) image = image.resize({ width: MAX_WIDTH });

		const baseName = slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';
		const fileName = `${baseName}-${randomBytes(3).toString('hex')}.${extension}`;
		const { store, author } = editorOf(context);
		await store.commit([{ path: `${MEDIA_DIR}/${fileName}`, content: await image.toBuffer() }], {
			author,
			message: imageMessage(fileName),
		});
		return { url: `${MEDIA_URL}/${fileName}` };
	});
