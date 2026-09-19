/** Erreur métier, avec le code HTTP à renvoyer (400, 404, 409…). Sans dépendance : importable partout. */
export class AdminError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}
