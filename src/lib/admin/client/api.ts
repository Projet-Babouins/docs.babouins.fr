/** Appels à l'API /api/admin. Seul endroit du navigateur qui connaît les routes. */
import type { TreeNode } from '../library';
import type { ProposalDetail, ProposalSummary, ReviewAction } from '../proposals';

export type { ProposalDetail, ProposalSummary, ReviewAction, TreeNode };
export type TreeFolder = Extract<TreeNode, { type: 'folder' }>;
export type TreeCourse = Extract<TreeNode, { type: 'course' }>;

export interface Course {
	id: string;
	version: string;
	url: string;
	title: string;
	description: string;
	body: string;
}

/** La personne connectée, et où partent ses enregistrements. */
export interface Me {
	user: { login: string; name: string; avatar: string; role: 'contributeur' | 'referent' };
	/** Stockage local (développement) : ni proposition, ni relecture. */
	local: boolean;
	/** Publication directe d'un référent, avec sa raison ; `null` = tout part en proposition. */
	direct: { reason: string } | null;
	required: number;
	/** Sa proposition en cours de relecture, s'il y en a une. */
	proposal: ProposalSummary | null;
}

export interface CourseDraft {
	originalId: string | null;
	version: string | null;
	folder: string;
	slug: string;
	title: string;
	description: string;
	body: string;
}

/** Nombre d'appels en cours : tant qu'il y en a, la page montre qu'elle travaille (`body.busy`, voir admin.css). */
let pending = 0;
function setBusy(delta: 1 | -1) {
	pending += delta;
	document.body.classList.toggle('busy', pending > 0);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	setBusy(1);
	const response = await fetch(`/api/admin/${path}`, init).finally(() => setBusy(-1));
	if (response.status === 401) {
		location.href = '/admin/login';
		throw new Error('Session expirée.');
	}
	if (!response.ok) {
		const data = await response.json().catch(() => null);
		throw new Error(data?.error ?? `Erreur ${response.status}`);
	}
	return response.status === 204 ? (undefined as T) : response.json();
}

const json = (method: string, body: unknown): RequestInit => ({
	method,
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body),
});

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

export const api = {
	tree: () => request<{ items: TreeNode[] }>('tree').then((data) => data.items),
	course: (id: string) => request<Course>(`course?${query({ id })}`),
	saveCourse: (draft: CourseDraft) =>
		request<{ id: string; version: string; url: string }>('course', json('PUT', draft)),
	deleteCourse: (id: string) => request<void>(`course?${query({ id })}`, { method: 'DELETE' }),
	createFolder: (parent: string, label: string) => request<{ path: string }>('folder', json('POST', { parent, label })),
	updateFolder: (path: string, label: string, slug: string) =>
		request<{ path: string }>('folder', json('PATCH', { path, label, slug })),
	deleteFolder: (path: string) => request<void>(`folder?${query({ path })}`, { method: 'DELETE' }),
	move: (path: string, targetFolder: string, before: string | null) =>
		request<{ path: string }>('move', json('POST', { path, targetFolder, before })),
	me: () => request<Me>('me'),
	setDirect: (reason: string | null) =>
		request<Pick<Me, 'direct'>>('me', json('POST', reason === null ? { direct: false } : { direct: true, reason })),
	proposals: () => request<{ items: ProposalSummary[] }>('proposals').then((data) => data.items),
	proposal: (number: number) => request<ProposalDetail>(`proposals?${query({ number: String(number) })}`),
	proposalPage: (number: number, page: string) =>
		request<Pick<Course, 'id' | 'title' | 'description' | 'body'>>(`proposals?${query({ number: String(number), page })}`),
	review: (number: number, action: ReviewAction, message: string, headSha: string) =>
		request<ProposalDetail>('proposals', json('POST', { number, action, message, headSha })),
	updateProposal: (number: number) => request<ProposalDetail>('proposals', json('POST', { number, action: 'update' })),
	withdrawProposal: (number: number) => request<void>('proposals', json('POST', { number, action: 'withdraw' })),
	publishProposal: (number: number, message: string) =>
		request<void>('proposals', json('POST', { number, action: 'publish', message })),
	async upload(file: File): Promise<string> {
		const body = new FormData();
		body.set('file', file);
		return (await request<{ url: string }>('upload', { method: 'POST', body })).url;
	},
};
