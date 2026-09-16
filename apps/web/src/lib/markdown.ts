import { Marked, type Tokens } from "marked";
import { sanitizeHtml } from "./sanitizeHtml";

// A bare ticket identifier in running text links to its ticket page.
const identifierPattern = /^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]*)\b/;

type TicketIdToken = Tokens.Generic & { text: string };

const ticketIdExtension = {
	name: "ticketId",
	level: "inline" as const,
	start: (src: string) => src.search(/\b[A-Z][A-Z0-9]{1,9}-[1-9]/),
	tokenizer: (src: string): TicketIdToken | undefined => {
		const match = identifierPattern.exec(src);
		if (match === null) return undefined;
		return { type: "ticketId", raw: match[0], text: match[1]! };
	},
	renderer: (token: Tokens.Generic) => `<a href="/t/${token.text}">${token.text}</a>`,
};

// An http(s) link opens a new tab without an opener or a referrer. Every
// other href is left for the sanitizer, which drops the unsafe schemes.
const renderer = {
	link: ({ href, title, text }: Tokens.Link) => {
		const external = /^https?:\/\//i.test(href);
		const titleAttr = title === null || title === undefined ? "" : ` title="${title}"`;
		const target = external ? ' target="_blank" rel="noopener noreferrer"' : "";
		return `<a href="${href}"${titleAttr}${target}>${text}</a>`;
	},
};

type MentionToken = Tokens.Generic & { text: string };

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// `@Name` for one of the given names, longest first so `@Careful reviewer`
// wins over `@Careful`, renders as a mark. The name may hold spaces. A
// letter or digit right after the name is another word, not a mention.
const mentionExtension = (names: readonly string[]) => {
	const alternatives = [...new Set(names)]
		.filter((name) => name.length > 0)
		.sort((a, b) => b.length - a.length)
		.map(escapePattern)
		.join("|");
	const pattern = new RegExp(`^@(${alternatives})(?![\\p{L}\\p{N}_-])`, "iu");
	return {
		name: "mention",
		level: "inline" as const,
		start: (src: string) => src.indexOf("@"),
		tokenizer: (src: string): MentionToken | undefined => {
			const match = pattern.exec(src);
			if (match === null) return undefined;
			return { type: "mention", raw: match[0], text: match[0] };
		},
		renderer: (token: Tokens.Generic) => `<mark class="mention">${token.text}</mark>`,
	};
};

// A renderer for a read-only view. Descriptions and comments come from
// agents and from curl, so nothing that runs survives: no script, no event
// handler, no javascript: link. `mentions` names the people, agents, and
// roles a body may address; the chat log passes the live agents of its room.
export const createMarkdownRenderer = (options: { mentions?: readonly string[] } = {}) => {
	const mentions = options.mentions ?? [];
	const marked = new Marked({
		gfm: true,
		// A chat message keeps its line breaks; a description does not.
		breaks: options.mentions !== undefined,
		extensions: mentions.length === 0 ? [ticketIdExtension] : [ticketIdExtension, mentionExtension(mentions)],
		renderer,
	});
	return (markdown: string): string => sanitizeHtml(marked.parse(markdown, { async: false }));
};

export const renderMarkdown = createMarkdownRenderer();
