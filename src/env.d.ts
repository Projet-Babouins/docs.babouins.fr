/**
 * Rôle d'un compte dans l'éditeur, déduit de son rôle sur le dépôt GitHub :
 * - `contributeur` : droit d'écriture. Ses enregistrements partent en relecture.
 * - `referent`     : rôle « Maintain » ou « Admin ». Peut aussi publier sans relecture.
 */
type AdminRole = 'contributeur' | 'referent';

/** Utilisateur connecté à l'espace admin (identité fournie par GitHub). */
interface AdminUser {
	login: string;
	name: string;
	email: string;
	avatar: string;
	role: AdminRole;
}

/** Publication directe activée par un référent, avec la raison qu'il a donnée. */
interface DirectMode {
	reason: string;
}

declare namespace App {
	/** Données stockées côté serveur dans la session. Rien de tout cela n'est envoyé au navigateur. */
	interface SessionData {
		user: AdminUser;
		/** Jeton GitHub de l'utilisateur (voir lib/admin/github-oauth.ts). Absent en stockage local. */
		githubToken: string;
		/** Présent quand un référent a activé la publication directe. */
		direct: DirectMode;
		/** Valeur anti-CSRF du flux OAuth, vérifiée au retour de GitHub. */
		oauthState: string;
	}

	/** Données attachées à la requête par le middleware. */
	interface Locals {
		user?: AdminUser;
		githubToken?: string;
		direct?: DirectMode;
	}
}
