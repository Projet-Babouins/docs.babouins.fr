/**
 * Les « propositions » : ce que l'éditeur appelle une proposition est une vraie pull
 * request GitHub. Les deux façons de contribuer (l'éditeur, ou Git) arrivent donc au même
 * endroit, et attendent les mêmes validations.
 *
 * - Enregistrer dans l'éditeur = un commit sur la branche `proposition-<login>`, et une
 *   pull request ouverte toute seule au premier enregistrement.
 * - Valider dans l'éditeur = une vraie « review » GitHub, faite au nom du relecteur.
 * - La règle des 2 validations n'est PAS appliquée ici : c'est le « ruleset » de la branche
 *   `main`, sur GitHub, qui refuse la fusion tant qu'elles manquent (voir le README).
 *   Ce fichier ne fait que l'afficher et demander à GitHub de fusionner dès que possible.
 */
import { GITHUB_BRANCH, GITHUB_REPO } from 'astro:env/server';
import { parseCourse } from './frontmatter';
import { GitHubError, type GitHub } from './github';
import { AdminError } from './errors';
import { COURSES_DIR, courseFilePath, isValidCourseId } from './paths';
import { createGitHubStore, forgetBranch } from './store/github';
import type { ContentStore } from './store/types';

/** Nombre de validations affiché. Doit correspondre à la règle de la branche `main` sur GitHub. */
export const REQUIRED_APPROVALS = 2;

/** Message de commit d'une image envoyée (voir api/admin/upload.ts) : un mauvais titre de proposition. */
export const imageMessage = (fileName: string) => `Ajoute l'image ${fileName}`;
const isImageMessage = (message: string) => message.startsWith(imageMessage(''));

const BRANCH_PREFIX = 'proposition-';
/** Branche de travail d'une personne. Un login GitHub ne contient que des lettres, chiffres et tirets. */
export const proposalBranch = (login: string) => `${BRANCH_PREFIX}${login.toLowerCase()}`;

const PR_BODY = (login: string) =>
	[
		`Proposition envoyée depuis l'éditeur de docs.babouins.fr par @${login}.`,
		'',
		`Elle sera publiée automatiquement après ${REQUIRED_APPROVALS} validations.`,
		'',
		'À vérifier pendant la relecture :',
		'- [ ] le contenu est juste, clair et sans faute',
		"- [ ] aucune information venant d'une entreprise (adresse IP, domaine interne, identifiant, capture non anonymisée)",
	].join('\n');

// --- Ce que renvoie GitHub (seulement les champs utilisés) ----------------------

interface PullRequest {
	number: number;
	node_id: string;
	title: string;
	state: 'open' | 'closed';
	merged?: boolean;
	html_url: string;
	updated_at: string;
	user: { login: string; avatar_url: string };
	head: { ref: string; sha: string; repo: { full_name: string } | null };
	/** Présent seulement quand la pull request est lue seule (pas dans une liste). */
	mergeable_state?: string;
}

interface Review {
	user: { login: string; avatar_url: string } | null;
	state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
	body: string;
	submitted_at?: string;
}

// --- Ce que reçoit le navigateur --------------------------------------------------

export interface ProposalSummary {
	number: number;
	title: string;
	url: string;
	author: { login: string; avatar: string };
	/** Vrai si c'est la proposition de la personne connectée. */
	mine: boolean;
	/** Vrai si elle vient de l'éditeur (et pas d'une pull request faite avec Git). */
	fromEditor: boolean;
	approvals: number;
	required: number;
	changesRequested: boolean;
	updatedAt: string;
}

export interface ProposalDetail extends ProposalSummary {
	/** Version relue : une validation porte sur cet état précis de la proposition. */
	headSha: string;
	/** `clean` prête · `blocked` en attente de validations · `behind` en retard · `conflict` · `unknown` · puis `published` ou `withdrawn` */
	state: 'clean' | 'blocked' | 'behind' | 'conflict' | 'unknown' | 'published' | 'withdrawn';
	/** `outdated` : une validation donnée sur une version précédente, que GitHub a annulée. */
	reviews: { login: string; avatar: string; verdict: 'approved' | 'changes' | 'outdated' | 'comment'; body: string; date: string }[];
	pages: { id: string; status: 'added' | 'modified' | 'removed' }[];
	otherFiles: string[];
}

export type ReviewAction = 'approve' | 'request-changes' | 'comment';

// --- Lecture ---------------------------------------------------------------------

const isFromEditor = (pull: PullRequest) =>
	pull.head.repo?.full_name === GITHUB_REPO && pull.head.ref === proposalBranch(pull.user.login);

const reviewsOf = (github: GitHub, number: number) => github.get<Review[]>(`/pulls/${number}/reviews?per_page=100`);

function summarize(pull: PullRequest, reviews: Review[], me: AdminUser): ProposalSummary {
	// Seul le dernier avis de chaque relecteur compte ; un simple commentaire ne change pas son avis.
	const verdicts = new Map<string, Review['state']>();
	for (const review of reviews) {
		if (!review.user || review.user.login === pull.user.login) continue;
		if (review.state !== 'COMMENTED' && review.state !== 'PENDING') verdicts.set(review.user.login, review.state);
	}
	const states = [...verdicts.values()];
	return {
		number: pull.number,
		title: pull.title,
		url: pull.html_url,
		author: { login: pull.user.login, avatar: pull.user.avatar_url },
		mine: pull.user.login === me.login,
		fromEditor: isFromEditor(pull),
		approvals: states.filter((state) => state === 'APPROVED').length,
		required: REQUIRED_APPROVALS,
		changesRequested: states.includes('CHANGES_REQUESTED'),
		updatedAt: pull.updated_at,
	};
}

/** La proposition ouverte d'une personne depuis l'éditeur, ou `null`. */
export async function findOwnProposal(github: GitHub, login: string): Promise<PullRequest | null> {
	const head = `${GITHUB_REPO.split('/')[0]}:${proposalBranch(login)}`;
	const pulls = await github.get<PullRequest[]>(
		`/pulls?state=open&base=${encodeURIComponent(GITHUB_BRANCH)}&head=${encodeURIComponent(head)}`,
	);
	return pulls[0] ?? null;
}

export async function getOwnProposal(github: GitHub, me: AdminUser): Promise<ProposalSummary | null> {
	const pull = await findOwnProposal(github, me.login);
	return pull ? summarize(pull, await reviewsOf(github, pull.number), me) : null;
}

/** Toutes les propositions ouvertes : celles de l'éditeur ET les pull requests faites avec Git. */
export async function listProposals(github: GitHub, me: AdminUser): Promise<ProposalSummary[]> {
	const pulls = await github.get<PullRequest[]>(
		`/pulls?state=open&base=${encodeURIComponent(GITHUB_BRANCH)}&sort=updated&direction=desc&per_page=50`,
	);
	return Promise.all(pulls.map(async (pull) => summarize(pull, await reviewsOf(github, pull.number), me)));
}

const getPull = (github: GitHub, number: number) => github.get<PullRequest>(`/pulls/${number}`);

export async function getProposal(github: GitHub, number: number, me: AdminUser): Promise<ProposalDetail> {
	const [pull, reviews, files] = await Promise.all([
		getPull(github, number),
		reviewsOf(github, number),
		github.get<{ filename: string; status: string; previous_filename?: string }[]>(`/pulls/${number}/files?per_page=100`),
	]);

	const pages: ProposalDetail['pages'] = [];
	const otherFiles: string[] = [];
	const addFile = (filename: string, status: ProposalDetail['pages'][number]['status']) => {
		const id = filename.startsWith(`${COURSES_DIR}/`) && filename.endsWith('.md') ? filename.slice(COURSES_DIR.length + 1, -3) : '';
		if (isValidCourseId(id)) pages.push({ id, status });
		else otherFiles.push(filename);
	};
	for (const file of files) {
		// Une page déplacée = une page retirée à l'ancienne adresse, ajoutée à la nouvelle.
		if (file.status === 'renamed' && file.previous_filename) addFile(file.previous_filename, 'removed');
		addFile(file.filename, file.status === 'removed' ? 'removed' : file.status === 'modified' ? 'modified' : 'added');
	}

	const states: Record<string, ProposalDetail['state']> = { clean: 'clean', blocked: 'blocked', behind: 'behind', dirty: 'conflict' };
	return {
		...summarize(pull, reviews, me),
		headSha: pull.head.sha,
		state: pull.merged ? 'published' : pull.state === 'closed' ? 'withdrawn' : (states[pull.mergeable_state ?? ''] ?? 'unknown'),
		reviews: reviews
			.filter((review) => review.user && review.state !== 'PENDING' && (review.state !== 'COMMENTED' || review.body))
			.map((review) => ({
				login: review.user!.login,
				avatar: review.user!.avatar_url,
				verdict: ({ APPROVED: 'approved', CHANGES_REQUESTED: 'changes', DISMISSED: 'outdated' } as const)[review.state as string] ?? 'comment',
				body: review.body,
				date: review.submitted_at ?? '',
			})),
		pages,
		otherFiles,
	};
}

/** Une page telle qu'elle est dans la proposition, pour la lire avant de valider. */
export async function getProposalPage(github: GitHub, number: number, id: string) {
	if (!isValidCourseId(id)) throw new AdminError(400, 'Identifiant de page invalide.');
	const pull = await getPull(github, number);
	const raw = await github.getBytes(`/contents/${courseFilePath(id)}?ref=${pull.head.sha}`).catch((error) => {
		if (error instanceof GitHubError && error.status === 404) throw new AdminError(404, 'Cette page n’est pas dans la proposition.');
		throw error;
	});
	return { id, ...parseCourse(raw.toString('utf8')) };
}

/** Une image telle qu'elle est dans la proposition (elle n'est pas encore sur le site). */
export async function getProposalBytes(github: GitHub, number: number, path: string): Promise<Buffer | null> {
	const pull = await getPull(github, number);
	return github.getBytes(`/contents/${path}?ref=${pull.head.sha}`).catch((error) => {
		if (error instanceof GitHubError && error.status === 404) return null;
		throw error;
	});
}

// --- Actions ---------------------------------------------------------------------

/** Dépose un avis sur une proposition : une vraie « review » GitHub, au nom du relecteur. */
export async function reviewProposal(
	github: GitHub,
	me: AdminUser,
	input: { number: number; action: ReviewAction; message: string; headSha: string },
): Promise<void> {
	const pull = await getPull(github, input.number);
	if (input.action !== 'comment' && pull.user.login === me.login) {
		throw new AdminError(400, 'On ne valide pas sa propre proposition : demande à quelqu’un d’autre de la relire.');
	}
	if (input.action !== 'approve' && !input.message) throw new AdminError(400, 'Écris un message pour expliquer ton avis.');
	// La proposition a changé pendant la relecture : l'avis porterait sur un texte que la personne n'a pas lu.
	if (pull.head.sha !== input.headSha) {
		throw new AdminError(409, 'Cette proposition vient d’être modifiée. Recharge-la, puis relis-la avant de donner ton avis.');
	}

	const events = { approve: 'APPROVE', 'request-changes': 'REQUEST_CHANGES', comment: 'COMMENT' } as const;
	await github.post(`/pulls/${input.number}/reviews`, {
		commit_id: pull.head.sha,
		event: events[input.action],
		body: input.message,
	});

	// Filet de sécurité. Normalement GitHub publie tout seul (fusion automatique) ; si l'option a été
	// oubliée sur le dépôt, la dernière validation déclenche ici la publication. GitHub reste juge :
	// il refuse la fusion tant que sa règle n'est pas satisfaite, et ce refus est ignoré.
	if (input.action !== 'approve') return;
	const { approvals, changesRequested } = summarize(pull, await reviewsOf(github, input.number), me);
	if (approvals < REQUIRED_APPROVALS || changesRequested) return;
	await github
		.put(`/pulls/${input.number}/merge`, { sha: pull.head.sha, merge_method: 'squash', commit_title: `${pull.title} (#${input.number})` })
		.then(() => forgetBranch(GITHUB_BRANCH))
		.catch(() => undefined);
}

/** Retire une proposition : son auteur, ou un référent. */
export async function withdrawProposal(github: GitHub, me: AdminUser, number: number): Promise<void> {
	const pull = await getPull(github, number);
	if (pull.user.login !== me.login && me.role !== 'referent') {
		throw new AdminError(403, 'Seul son auteur (ou un référent) peut retirer une proposition.');
	}
	await github.patch(`/pulls/${number}`, { state: 'closed' });
	if (isFromEditor(pull)) {
		await github.delete(`/git/refs/heads/${pull.head.ref}`).catch(() => undefined); // branche déjà supprimée : tant mieux
		forgetBranch(pull.head.ref);
	}
}

/** Remet une proposition à jour avec ce qui a été publié depuis (GitHub fusionne `main` dedans). */
export async function updateProposal(github: GitHub, number: number): Promise<void> {
	const pull = await getPull(github, number);
	try {
		await github.put(`/pulls/${number}/update-branch`, { expected_head_sha: pull.head.sha });
	} catch (error) {
		if (error instanceof GitHubError && error.status === 422) {
			throw new AdminError(409, 'Mise à jour impossible : la même page a été modifiée des deux côtés. Un référent peut régler le conflit sur GitHub.');
		}
		throw error;
	}
	forgetBranch(pull.head.ref);
}

/**
 * Publication directe d'une proposition par un référent, sans attendre les validations.
 * GitHub l'accepte parce que le rôle des référents est dans la liste de contournement du
 * ruleset ; pour tout autre compte, GitHub refuse la fusion, quoi que fasse ce code.
 */
export async function publishProposal(github: GitHub, me: AdminUser, number: number, reason: string): Promise<void> {
	if (me.role !== 'referent') throw new AdminError(403, 'Seuls les référents peuvent publier sans relecture.');
	const pull = await getPull(github, number);
	try {
		await github.put(`/pulls/${number}/merge`, {
			sha: pull.head.sha,
			merge_method: 'squash',
			commit_title: `${pull.title} (#${number})`,
			commit_message: `Publication directe par ${me.login} : ${reason}`,
		});
	} catch (error) {
		if (error instanceof GitHubError) throw new AdminError(409, `GitHub a refusé la publication : ${error.message}`);
		throw error;
	}
	forgetBranch(GITHUB_BRANCH);
	// La trace reste visible dans la proposition, pas seulement dans l'historique git.
	await github
		.post(`/issues/${number}/comments`, {
			body: `Publiée sans attendre les ${REQUIRED_APPROVALS} validations, par @${me.login}.\n\nRaison : ${reason}`,
		})
		.catch(() => undefined);
}

// --- Enregistrer dans une proposition -------------------------------------------

/** (Re)crée la branche de travail à partir du site publié. Appelé seulement sans proposition ouverte. */
async function resetBranch(github: GitHub, branch: string): Promise<void> {
	const main = await github.get<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(GITHUB_BRANCH)}`);
	try {
		await github.post('/git/refs', { ref: `refs/heads/${branch}`, sha: main.object.sha });
	} catch (error) {
		// 422 : la branche existe encore (reste d'une proposition publiée ou retirée). On la ramène sur `main`.
		if (!(error instanceof GitHubError) || error.status !== 422) throw error;
		await github.patch(`/git/refs/heads/${branch}`, { sha: main.object.sha, force: true });
	}
	forgetBranch(branch);
}

async function openPullRequest(github: GitHub, me: AdminUser, branch: string, title: string): Promise<void> {
	let pull: PullRequest;
	try {
		pull = await github.post<PullRequest>('/pulls', { title, head: branch, base: GITHUB_BRANCH, body: PR_BODY(me.login) });
	} catch (error) {
		// 422 : aucune différence avec le site publié (enregistrement sans changement). Rien à proposer.
		if (error instanceof GitHubError && error.status === 422) return;
		throw error;
	}
	// GitHub fusionnera tout seul dès que les validations et les vérifications seront là,
	// que les avis soient donnés ici ou sur github.com. Demande l'option « Allow auto-merge » du dépôt.
	await github
		.graphql(
			'mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { clientMutationId } }',
			{ id: pull.node_id },
		)
		.catch((error) => console.error(`Fusion automatique non activée sur #${pull.number} : ${error.message}`));
}

/**
 * Stockage d'une personne qui propose : elle lit sa proposition en cours (pour retrouver
 * ce qu'elle a déjà écrit), ou à défaut le site publié, et elle enregistre dans sa branche.
 * Créé pour une seule requête : « a-t-elle une proposition ouverte ? » n'est demandé qu'une fois.
 */
export function createProposalStore(github: GitHub, me: AdminUser): ContentStore {
	const branch = proposalBranch(me.login);
	let own: Promise<PullRequest | null> | undefined;
	const ownProposal = () => (own ??= findOwnProposal(github, me.login));
	const reader = async () => createGitHubStore(github, (await ownProposal()) ? branch : GITHUB_BRANCH);

	return {
		list: async (folder) => (await reader()).list(folder),
		read: async (path) => (await reader()).read(path),
		readBytes: async (path) => (await reader()).readBytes(path),

		async commit(changes, options) {
			const pull = await ownProposal();
			if (!pull) await resetBranch(github, branch);
			await createGitHubStore(github, branch).commit(changes, options);

			if (!pull) await openPullRequest(github, me, branch, options.message);
			// Une proposition ouverte par l'envoi d'une image prend le nom de la première page enregistrée.
			else if (isImageMessage(pull.title) && !isImageMessage(options.message)) {
				await github.patch(`/pulls/${pull.number}`, { title: options.message });
			}
			own = undefined;
		},
	};
}
