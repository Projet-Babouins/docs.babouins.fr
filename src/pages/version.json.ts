import type { APIRoute } from 'astro';
import { BUILD_ID } from '../lib/build-id';

/**
 * Fichier statique minuscule, généré au build : les pages ouvertes le
 * consultent pour savoir si le site a été reconstruit (voir lib/live-update.ts).
 */
export const GET: APIRoute = () => Response.json({ build: BUILD_ID });
