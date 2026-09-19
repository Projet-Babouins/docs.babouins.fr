import { ADMIN_STORE, GITHUB_BRANCH } from 'astro:env/server';
import { createGitHub } from '../github';
import { AdminError } from '../errors';
import { createProposalStore } from '../proposals';
import { createGitHubStore } from './github';
import { localStore } from './local';
import type { ContentStore } from './types';

export * from './types';

/**
 * Stockage local : le disque du poste, en développement. Immédiat, et git reste à la main.
 * Il n'y a alors ni proposition ni relecture (`ADMIN_STORE=github` dans .env permet
 * d'essayer le vrai fonctionnement depuis son poste).
 * En production c'est toujours GitHub : écrire sur le disque du serveur ne publierait rien.
 */
export const isLocalMode = () => import.meta.env.DEV && ADMIN_STORE !== 'github';

/**
 * Stockage à utiliser pour la personne connectée. C'est ICI que se décide où part
 * un enregistrement :
 * - par défaut, dans sa proposition : il sera relu avant d'être publié ;
 * - directement sur le site, seulement pour un référent qui a activé la publication directe.
 * Le navigateur ne choisit rien : le rôle et le mode viennent de la session (voir middleware.ts).
 * `writing` : la requête va enregistrer (voir createProposalStore).
 */
export function storeFor(locals: App.Locals, writing: boolean): ContentStore {
	if (isLocalMode()) return localStore;

	const user = locals.user!; // garanti par src/middleware.ts
	if (!locals.githubToken) throw new AdminError(401, 'Ta session GitHub a expiré. Reconnecte-toi.');
	const github = createGitHub(locals.githubToken);

	if (locals.direct && user.role === 'referent') {
		// La raison donnée par le référent est écrite dans chaque commit : rien n'est publié en cachette.
		return createGitHubStore(github, GITHUB_BRANCH, { trailer: `Publication directe : ${locals.direct.reason}` });
	}
	return createProposalStore(github, user, writing);
}
