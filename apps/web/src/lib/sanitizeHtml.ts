// The elements a rendered description or comment may hold, each with the
// attributes it keeps. Every other element is unwrapped: its text stays,
// the tag goes.
const allowed: Record<string, readonly string[]> = {
	a: ["href", "title", "target", "rel"],
	blockquote: [],
	br: [],
	code: ["class"],
	del: [],
	em: [],
	h1: [],
	h2: [],
	h3: [],
	h4: [],
	h5: [],
	h6: [],
	hr: [],
	img: ["src", "alt", "title"],
	input: ["type", "checked", "disabled"],
	li: [],
	ol: ["start"],
	p: [],
	pre: [],
	strong: [],
	sub: [],
	sup: [],
	table: [],
	tbody: [],
	td: ["align"],
	th: ["align"],
	thead: [],
	tr: [],
	ul: [],
};

// These carry code or a foreign document. The element and its content go.
const dropped: ReadonlySet<string> = new Set([
	"script",
	"style",
	"iframe",
	"object",
	"embed",
	"svg",
	"math",
	"template",
	"noscript",
	"link",
	"meta",
	"base",
	"form",
]);

// A link may point at the web, at mail, or inside this app. An image may
// point at the web or at the file of one attachment on this server, which
// is the URL the attachment's markdown line names.
const safeHref = (value: string) => /^(https?:|mailto:)/i.test(value.trim()) || /^[/#]/.test(value.trim());
const attachmentFile = /^\/api\/attachments\/[0-9A-Z]{26}\/file$/;
const safeSrc = (value: string) => /^https?:/i.test(value.trim()) || attachmentFile.test(value.trim());

const sanitizeElement = (element: Element) => {
	for (const child of [...element.children]) sanitizeElement(child);
	const tag = element.tagName.toLowerCase();
	if (dropped.has(tag)) {
		element.remove();
		return;
	}
	const attributes = allowed[tag];
	if (attributes === undefined) {
		element.replaceWith(...element.childNodes);
		return;
	}
	for (const name of element.getAttributeNames()) {
		const value = element.getAttribute(name) ?? "";
		const keep =
			attributes.includes(name) &&
			(name !== "href" || safeHref(value)) &&
			(name !== "src" || safeSrc(value)) &&
			(name !== "class" || /^language-[\w-]+$/.test(value)) &&
			(name !== "type" || value === "checkbox");
		if (!keep) element.removeAttribute(name);
	}
	if (tag === "a" && element.hasAttribute("target")) element.setAttribute("rel", "noopener noreferrer");
	if (tag === "input") element.setAttribute("disabled", "");
};

// Returns `html` with every element, attribute, and URL outside the lists
// above removed. The result renders nothing that runs.
export const sanitizeHtml = (html: string): string => {
	const body = new DOMParser().parseFromString(html, "text/html").body;
	for (const child of [...body.children]) sanitizeElement(child);
	return body.innerHTML;
};
