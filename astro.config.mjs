// @ts-check
import { defineConfig, envField } from 'astro/config';
import starlight from '@astrojs/starlight';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
	site: 'https://docs.babouins.fr',

	// Le site reste statique ; seules les routes /admin et /api/admin sont rendues
	// par le serveur Node (elles déclarent `export const prerender = false`).
	adapter: node({ mode: 'standalone' }),

	// Session de l'espace admin : 8 heures.
	session: { ttl: 60 * 60 * 8 },

	security: {
		// La vérification d'origine est faite dans src/middleware.ts, à partir de `site` : celle d'Astro
		// compare à l'URL vue par Node, qui est fausse derrière le reverse proxy.
		checkOrigin: false,
		// Si le proxy transmet X-Forwarded-Host et X-Forwarded-Proto, Astro retrouve la vraie adresse.
		allowedDomains: [{ hostname: 'docs.babouins.fr', protocol: 'https' }],
	},

	// L'éditeur visuel est gros : on demande à Vite de le préparer dès le démarrage
	// du serveur de dev, plutôt qu'à la première ouverture de /admin.
	vite: { optimizeDeps: { include: ['@milkdown/crepe'] } },

	// Variables d'environnement, validées au démarrage. Voir .env.example.
	env: {
		schema: {
			// Dépôt GitHub de la doc (proprietaire/depot) et branche publiée.
			GITHUB_REPO: envField.string({
				context: 'server',
				access: 'public',
				default: 'Projet-Babouins/docs.babouins.fr',
			}),
			GITHUB_BRANCH: envField.string({ context: 'server', access: 'public', default: 'main' }),
			// Adresses de GitHub. À changer seulement pour des essais contre un faux GitHub.
			GITHUB_URL: envField.string({ context: 'server', access: 'public', default: 'https://github.com' }),
			GITHUB_API_URL: envField.string({ context: 'server', access: 'public', default: 'https://api.github.com' }),
			// Identifiants de la GitHub App qui sert à la connexion (voir .env.example).
			OAUTH_CLIENT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
			OAUTH_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
			// Développement uniquement : connecte directement ce login, sans passer par GitHub.
			ADMIN_DEV_LOGIN: envField.string({ context: 'server', access: 'secret', optional: true }),
			// Développement uniquement : `github` pour essayer le vrai stockage au lieu du disque local.
			ADMIN_STORE: envField.enum({
				context: 'server',
				access: 'public',
				values: ['local', 'github'],
				default: 'local',
			}),
		},
	},

	integrations: [
		starlight({
			title: 'Babouins',
			logo: { src: './src/assets/logo.png', alt: 'Logo Babouins' },
			favicon: '/favicon.png',
			// Couleurs : la même palette que la vitrine www.babouins.fr.
			customCss: ['./src/styles/theme.css'],
			// Blocs de code sombres dans les deux thèmes et sans ombre, comme sur la vitrine.
			expressiveCode: {
				themes: ['github-dark'],
				styleOverrides: { borderRadius: '0.5rem', frames: { frameBoxShadowCssValue: 'none' } },
			},
			locales: { root: { label: 'Français', lang: 'fr' } },
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/Projet-Babouins/docs.babouins.fr',
				},
			],
			// Adresse du fichier de chaque page sur GitHub, pour le lien « Modifier cette page ».
			editLink: { baseUrl: 'https://github.com/Projet-Babouins/docs.babouins.fr/edit/main/' },
			sidebar: [
				{
					label: 'Documentation',
					// Un sous-dossier de src/content/docs/docs = un groupe.
					items: [{ autogenerate: { directory: 'docs' } }],
				},
			],
			// Ordre et noms des dossiers choisis dans l'admin (voir src/starlight-menu.ts).
			routeMiddleware: './src/starlight-menu.ts',
			components: {
				// <head> d'origine + mise à jour douce des pages ouvertes (voir src/lib/live-update.ts).
				Head: './src/components/Head.astro',
				// « Modifier cette page » : dans l'éditeur du site, ou sur GitHub.
				EditLink: './src/components/EditLink.astro',
			},
		}),
	],
});
