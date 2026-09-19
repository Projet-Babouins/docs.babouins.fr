/**
 * Identifiant du build en cours. Ce module n'est évalué qu'une fois par build :
 * toutes les pages et /version.json reçoivent donc la même valeur.
 */
export const BUILD_ID = Date.now().toString(36);
