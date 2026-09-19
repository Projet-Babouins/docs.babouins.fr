/**
 * Écran « Relectures » : la liste des propositions ouvertes, puis le détail d'une
 * proposition (pages modifiées, avis déjà donnés, et les boutons pour donner le sien).
 *
 * Les propositions sont de vraies pull requests GitHub : celles faites avec Git
 * apparaissent donc ici aussi, et un avis donné ici apparaît sur GitHub.
 * Aucune règle ne vit dans ce fichier : le serveur (et GitHub) décident de qui peut quoi.
 */
import { api, type Me, type ProposalDetail, type ProposalSummary, type ReviewAction } from './api';
import { icon, type IconName } from './icons';
import { createMarkdownViewer } from './markdown-editor';
import { confirmDialog, el, openDialog, run, toast } from './ui';

interface ReviewsOptions {
	me: () => Me;
	/** Une proposition a été publiée, retirée ou mise à jour : le reste de l'admin doit se rafraîchir. */
	onChange: () => Promise<void>;
}

const dateOf = (iso: string) =>
	iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';

const avatar = (url: string) => (url ? el('img', { src: url, alt: '', width: 20, height: 20, class: 'avatar' }) : '');

function badge(text: string, kind: '' | 'ok' | 'warn' = ''): HTMLElement {
	return el('span', { class: `badge ${kind}` }, text);
}

function badgesOf(proposal: ProposalSummary): HTMLElement[] {
	const done = proposal.approvals >= proposal.required;
	return [
		badge(`${proposal.approvals}/${proposal.required} validations`, done ? 'ok' : ''),
		...(proposal.changesRequested ? [badge('Corrections demandées', 'warn')] : []),
		...(proposal.mine ? [badge('La tienne')] : []),
		...(proposal.fromEditor ? [] : [badge('Faite avec Git')]),
	];
}

const STATE_TEXT: Record<ProposalDetail['state'], string> = {
	clean: 'Tout est bon : la publication se fait toute seule, en quelques minutes.',
	blocked: 'En attente de validations (ou de la vérification automatique du build).',
	behind: 'Le site a changé depuis cette proposition : elle doit être mise à jour avant d’être publiée.',
	conflict: 'Conflit : la même page a été modifiée sur le site entre-temps. Un référent peut le régler sur GitHub.',
	unknown: 'GitHub calcule encore l’état de cette proposition. Actualise dans un instant.',
	published: 'Publiée : elle sera en ligne dans quelques minutes.',
	withdrawn: 'Retirée : cette proposition ne sera pas publiée.',
};

const VERDICTS: Record<ProposalDetail['reviews'][number]['verdict'], { label: string; icon: IconName }> = {
	approved: { label: 'a validé', icon: 'approve' },
	changes: { label: 'demande des corrections', icon: 'changes' },
	outdated: { label: 'avait validé une version précédente', icon: 'refresh' },
	comment: { label: 'a commenté', icon: 'comment' },
};

const PAGE_STATUS = { added: 'nouvelle page', modified: 'modifiée', removed: 'supprimée' } as const;

export function createReviews(root: HTMLElement, options: ReviewsOptions) {
	const content = root.querySelector<HTMLElement>('#reviews-content')!;
	const heading = root.querySelector<HTMLElement>('#reviews-title')!;
	const backButton = root.querySelector<HTMLButtonElement>('#reviews-back')!;
	/** Proposition affichée ; `null` = la liste. */
	let opened: number | null = null;

	// --- Liste ---------------------------------------------------------------

	async function showList() {
		opened = null;
		backButton.hidden = true;
		heading.textContent = 'Relectures';
		const proposals = await api.proposals();

		if (proposals.length === 0) {
			content.replaceChildren(el('p', { class: 'review-empty' }, 'Aucune proposition à relire pour le moment.'));
			return;
		}
		content.replaceChildren(
			el('p', { class: 'review-intro' }, `Une proposition est publiée après ${options.me().required} validations. On ne valide pas la sienne.`),
			...proposals.map((proposal) => {
				const card = el(
					'button',
					{ type: 'button', class: 'review-card' },
					el('strong', {}, proposal.title),
					el('span', { class: 'review-meta' }, avatar(proposal.author.avatar), `${proposal.author.login} · ${dateOf(proposal.updatedAt)}`),
					el('span', { class: 'badges' }, ...badgesOf(proposal)),
				);
				card.addEventListener('click', () => run(() => showDetail(proposal.number)));
				return card;
			}),
		);
	}

	// --- Détail --------------------------------------------------------------

	async function showDetail(number: number) {
		render(await api.proposal(number));
	}

	function render(proposal: ProposalDetail) {
		const me = options.me();
		opened = proposal.number;
		backButton.hidden = false;
		heading.textContent = `Proposition nº ${proposal.number}`;

		const previewHost = el('div', { class: 'doc-editor review-preview', hidden: true });
		const viewer = createMarkdownViewer(previewHost);
		const pages = proposal.pages.map((page) => {
			const label = `${page.id} (${PAGE_STATUS[page.status]})`;
			if (page.status === 'removed') return el('li', {}, label);
			const button = el('button', { type: 'button', class: 'link' }, label);
			button.addEventListener('click', () =>
				run(async () => {
					const content = await api.proposalPage(proposal.number, page.id);
					previewHost.hidden = false;
					// Le titre fait partie de ce qui est relu : il est affiché avec le texte.
					await viewer.show(`# ${content.title}\n\n${content.description ? `*${content.description}*\n\n` : ''}${content.body}`, proposal.number);
					previewHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}),
			);
			return el('li', {}, button);
		});

		const message = el('textarea', {
			class: 'review-message',
			rows: 3,
			maxLength: 2000,
			placeholder: 'Ton message (facultatif pour valider). On critique le texte, jamais la personne.',
		});
		const act = (action: ReviewAction) =>
			run(async () => {
				render(await api.review(proposal.number, action, message.value.trim(), proposal.headSha));
				toast(action === 'approve' ? 'Proposition validée.' : 'Avis envoyé.');
				await options.onChange();
			});
		const button = (label: string, iconName: IconName, kind: string, action: () => void) => {
			const node = el('button', { type: 'button', class: `btn ${kind}` }, icon(iconName), label);
			node.addEventListener('click', action);
			return node;
		};

		// Dernier avis tranché de la personne connectée : inutile de lui reproposer « Valider » s'il vaut toujours.
		const myVerdict = proposal.reviews.findLast((review) => review.login === me.user.login && review.verdict !== 'comment')?.verdict;
		const open = proposal.state !== 'published' && proposal.state !== 'withdrawn';
		const actions: HTMLElement[] = [];
		if (!proposal.mine && open) {
			actions.push(
				...(myVerdict === 'approved' ? [] : [button('Valider', 'approve', 'primary', () => act('approve'))]),
				button('Demander des corrections', 'changes', '', () => act('request-changes')),
			);
		}
		actions.push(button('Commenter', 'comment', '', () => act('comment')));
		if (proposal.state === 'behind') {
			actions.push(
				button('Mettre à jour', 'refresh', '', () =>
					run(async () => {
						render(await api.updateProposal(proposal.number));
						await options.onChange();
					}),
				),
			);
		}
		if (me.user.role === 'referent' && open) actions.push(button('Publier sans attendre', 'direct', '', () => run(() => publish(proposal))));
		if (open && (proposal.mine || me.user.role === 'referent')) {
			actions.push(button(proposal.mine ? 'Retirer ma proposition' : 'Retirer', 'trash', 'ghost danger', () => run(() => withdraw(proposal))));
		}

		content.replaceChildren(
			el('h1', { class: 'review-title' }, proposal.title),
			el('p', { class: 'review-meta' }, avatar(proposal.author.avatar), `${proposal.author.login} · mise à jour le ${dateOf(proposal.updatedAt)}`),
			el('p', { class: 'badges' }, ...badgesOf(proposal)),
			el('p', { class: 'review-state' }, STATE_TEXT[proposal.state]),

			el('h2', {}, 'Ce qui change'),
			proposal.pages.length ? el('ul', { class: 'review-files' }, ...pages) : el('p', { class: 'review-empty' }, 'Aucune page de cours.'),
			...(proposal.otherFiles.length
				? [el('p', { class: 'review-other' }, `Autres fichiers : ${proposal.otherFiles.join(', ')}`)]
				: []),
			el(
				'p',
				{},
				el('a', { href: `${proposal.url}/files`, target: '_blank', rel: 'noopener' }, 'Voir les différences ligne par ligne sur GitHub'),
			),
			previewHost,

			el('h2', {}, 'Avis'),
			proposal.reviews.length
				? el(
						'ul',
						{ class: 'review-list' },
						...proposal.reviews.map((review) =>
							el(
								'li',
								{ class: review.verdict },
								el('span', { class: 'review-meta' }, icon(VERDICTS[review.verdict].icon), avatar(review.avatar), `${review.login} ${VERDICTS[review.verdict].label} · ${dateOf(review.date)}`),
								...(review.body ? [el('p', {}, review.body)] : []),
							),
						),
					)
				: el('p', { class: 'review-empty' }, 'Personne n’a encore donné son avis.'),

			el('h2', {}, proposal.mine ? 'Répondre' : 'Ton avis'),
			...(proposal.mine
				? [el('p', { class: 'review-empty' }, 'On ne valide pas sa propre proposition. Pour la corriger, modifie simplement tes pages : elle se met à jour toute seule.')]
				: []),
			message,
			el('div', { class: 'review-actions' }, ...actions),
		);
	}

	async function publish(proposal: ProposalDetail) {
		const values = await openDialog({
			title: 'Publier sans attendre la relecture ?',
			message: 'La proposition sera mise en ligne tout de suite. Ta raison reste visible dans l’historique, à ton nom.',
			fields: [{ name: 'reason', label: 'Raison', required: true, maxLength: 200, hint: 'Exemple : erreur gênante à corriger avant le TP de demain.' }],
			confirmLabel: 'Publier',
		});
		if (!values) return;
		await api.publishProposal(proposal.number, values.reason);
		toast('Proposition publiée. En ligne dans quelques minutes.');
		await options.onChange();
		await showList();
	}

	async function withdraw(proposal: ProposalDetail) {
		const confirmed = await confirmDialog({
			title: 'Retirer cette proposition ?',
			message: 'Elle ne sera pas publiée, et les modifications qu’elle contient seront abandonnées.',
			confirmLabel: 'Retirer',
			danger: true,
		});
		if (!confirmed) return;
		await api.withdrawProposal(proposal.number);
		toast('Proposition retirée.');
		await options.onChange();
		await showList();
	}

	backButton.addEventListener('click', () => run(showList));
	root.querySelector('#reviews-refresh')!.addEventListener('click', () => run(() => (opened === null ? showList() : showDetail(opened))));

	return {
		/** Affiche la liste, ou directement une proposition. */
		open: (number?: number) => (number === undefined ? showList() : showDetail(number)),
	};
}
