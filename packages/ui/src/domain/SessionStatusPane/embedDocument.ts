const contentSecurityPolicy = [
	"default-src 'none'",
	"base-uri 'none'",
	"connect-src 'none'",
	"font-src data:",
	"form-action 'none'",
	"frame-src 'none'",
	"img-src data:",
	"media-src data:",
	"navigate-to 'none'",
	"object-src 'none'",
	"script-src 'unsafe-inline'",
	"style-src 'unsafe-inline'",
	"worker-src 'none'",
].join("; ");

const escapeAttribute = (value: string) =>
	value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function sessionStatusEmbedContentDocument(title: string, html: string) {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="dark light"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeAttribute(title)}</title></head><body>${html}</body></html>`;
}

export function sessionStatusEmbedDocument(title: string, contentDocument: string) {
	const frameSecurityPolicy = [
		"default-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-src about:",
		"object-src 'none'",
		"script-src 'unsafe-inline'",
		"style-src 'unsafe-inline'",
	].join("; ");
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(frameSecurityPolicy)}"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="dark light"><style>html,body{margin:0;height:100%;background:transparent}iframe{display:block;border:0;width:100%;height:100%}</style><title>${escapeAttribute(title)}</title></head><body><iframe title="${escapeAttribute(title)}" srcdoc="${escapeAttribute(contentDocument)}" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></body></html>`;
}
