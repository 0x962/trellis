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

// Markdown to HTML for a read-only view, with nothing removed. The HTML
// holds whatever the markdown holds, so only `renderMarkdown` may reach a
// page with it.
export const createMarkdownParser = () => {
	const marked = new Marked({
		gfm: true,
		extensions: [ticketIdExtension],
		renderer,
	});
	return (markdown: string): string => marked.parse(markdown, { async: false });
};

const parseMarkdown = createMarkdownParser();

// The HTML of a description, a comment, or the message of an agent run.
// The text comes from agents and from curl, so nothing that runs survives:
// no script, no event handler, and no javascript: link.
export const renderMarkdown = (markdown: string): string => sanitizeHtml(parseMarkdown(markdown));
