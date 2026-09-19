import { dump, load } from 'js-yaml';

/** Champs d'un cours modifiables depuis l'éditeur. */
export interface CourseFields {
	title: string;
	description: string;
	body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

type Frontmatter = Record<string, unknown>;

function splitFile(raw: string): { data: Frontmatter; body: string } {
	const match = FRONTMATTER.exec(raw);
	if (!match) return { data: {}, body: raw };
	const parsed = load(match[1]);
	const data = parsed && typeof parsed === 'object' ? (parsed as Frontmatter) : {};
	return { data, body: raw.slice(match[0].length) };
}

/** Fichier Markdown → champs de l'éditeur. */
export function parseCourse(raw: string): CourseFields {
	const { data, body } = splitFile(raw);
	return {
		title: typeof data.title === 'string' ? data.title : '',
		description: typeof data.description === 'string' ? data.description : '',
		body: body.replace(/^\r?\n/, ''),
	};
}

/**
 * Champs de l'éditeur → fichier Markdown. `previousRaw` est le contenu actuel
 * du fichier : ses autres clés de frontmatter (écrites à la main) sont conservées.
 */
export function serializeCourse(fields: CourseFields, previousRaw = ''): string {
	const { data } = splitFile(previousRaw);

	data.title = fields.title;
	if (fields.description) data.description = fields.description;
	else delete data.description;

	const header = dump(data, { lineWidth: -1 }).trimEnd();
	return `---\n${header}\n---\n\n${fields.body.trim()}\n`;
}
