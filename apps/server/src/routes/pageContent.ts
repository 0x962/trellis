import { errors, type PageContentFile } from "@trellis/api";
import type { Context } from "hono";
import type { Config } from "../config.ts";
import type { RequestContext } from "../context.ts";
import type { ServiceTransport } from "../db/transport.ts";
import { touchRenderLease } from "../pageLeases.ts";
import { createDbTiming, serverTimingHeader } from "../serverTiming.ts";
import { pageObjectPath } from "../storage/pageObjects.ts";

export const PAGE_RENDER_PREFIX = "/api/page-render";

// The address of the frame a viewer mounts, and the address of the page
// document inside that frame. The document sits under the frame address plus
// a slash, so every relative address in the page resolves under the same
// lease and no asset of another version is reachable.
export const renderFrameHref = (lease: string) => `${PAGE_RENDER_PREFIX}/${lease}`;
export const renderContentRoot = (lease: string) => `${PAGE_RENDER_PREFIX}/${lease}/`;

// A page holds untrusted HTML. Its own policy cannot stop its scripts from
// sending the frame they run in to another site, and an address is enough to
// carry the content of the page away. A frame policy on the document that
// holds it can stop that, so Trellis serves this fixed document, gives it a
// `frame-src` of the one lease path, and puts the page inside it.
const frameDocument = (root: string) =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page</title>` +
	`<style>html,body{margin:0;height:100%;background:#fff}iframe{display:block;border:0;width:100%;height:100%}</style>` +
	`</head><body><iframe src="${root}" sandbox="allow-scripts" referrerpolicy="no-referrer" ` +
	`title="Page content"></iframe></body></html>`;

const NO_STORE = "no-store";
const PERMISSIONS =
	"accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()";

const guardHeaders = () => ({
	"x-content-type-options": "nosniff",
	"referrer-policy": "no-referrer",
	"permissions-policy": PERMISSIONS,
});

// The address the browser used for this request, without its path. The
// `frame-src` and the resource policies of the page document name it, because
// a sandboxed document has no origin of its own and `'self'` matches nothing
// inside it.
const originOf = (c: Context) => new URL(c.req.url).origin;

const framePolicy = (origin: string, root: string) =>
	[
		"default-src 'none'",
		"style-src 'unsafe-inline'",
		`frame-src ${origin}${root}`,
		"form-action 'none'",
		"base-uri 'none'",
		"object-src 'none'",
	].join("; ");

// What the page document itself may load: its own files, and data or blob
// addresses its scripts build. It reaches no other site, submits no form,
// holds no frame, and creates no code at run time.
const contentPolicy = (origin: string, root: string) => {
	const own = `${origin}${root}`;
	return [
		"default-src 'none'",
		`script-src ${own} 'unsafe-inline'`,
		`style-src ${own} 'unsafe-inline'`,
		`img-src ${own} data: blob:`,
		`font-src ${own} data:`,
		`media-src ${own} data: blob:`,
		"connect-src 'none'",
		"form-action 'none'",
		"frame-src 'none'",
		"child-src 'none'",
		"object-src 'none'",
		"base-uri 'none'",
	].join("; ");
};

const errorBody = (code: "RENDER_LEASE_EXPIRED" | "PAGE_DELETED" | "NOT_FOUND", data?: unknown) => ({
	defined: true,
	code,
	status: errors[code].status,
	message: errors[code].message,
	data,
});

// A page address arrives percent-encoded. A malformed escape names no asset,
// so it reads as an address the version does not hold.
const decodedPath = (raw: string) => {
	try {
		return decodeURIComponent(raw);
	} catch (error) {
		if (error instanceof URIError) return null;
		throw error;
	}
};

// GET /api/page-render/{lease} draws the frame document.
export const pageFrameRoute = () => async (c: Context) => {
	const lease = touchRenderLease(c.req.param("lease") ?? "", new Date());
	if (lease === undefined) return c.json(errorBody("RENDER_LEASE_EXPIRED"), 401);
	const root = renderContentRoot(lease.id);
	return c.html(frameDocument(root), 200, {
		...guardHeaders(),
		"cache-control": NO_STORE,
		"content-security-policy": framePolicy(originOf(c), root),
	});
};

// GET /api/page-render/{lease}/{path} serves the stored bytes of one page
// version. The empty path and `index.html` both name the document.
export const pageContentRoute =
	({ config, transport }: { config: Config; transport: ServiceTransport }) =>
	async (c: Context) => {
		const now = new Date();
		const lease = touchRenderLease(c.req.param("lease") ?? "", now);
		if (lease === undefined) return c.json(errorBody("RENDER_LEASE_EXPIRED"), 401);
		const root = renderContentRoot(lease.id);
		const timing = createDbTiming();
		const headers: Record<string, string> = {
			...guardHeaders(),
			"server-timing": serverTimingHeader(timing),
			"cache-control": NO_STORE,
			"content-security-policy": contentPolicy(originOf(c), root),
		};
		const raw = new URL(c.req.url).pathname.slice(root.length);
		const decoded = decodedPath(raw);
		const missing = () => c.json(errorBody("NOT_FOUND", { kind: "page file", ref: raw }), 404, headers);
		if (decoded === null) return missing();
		const path = decoded === "" || decoded === "index.html" ? undefined : decoded;
		const ctx: RequestContext = { actor: null, session: null, reqId: c.get("requestId"), now };
		const file = (await transport.call(
			"pages.content",
			ctx,
			{ pageId: lease.pageId, version: lease.version, path },
			timing,
		)) as PageContentFile;
		headers["server-timing"] = serverTimingHeader(timing);
		if (file.state === "deleted") return c.json(errorBody("PAGE_DELETED"), 410, headers);
		if (file.state === "missing") return missing();
		const etag = `"${file.sha256}"`;
		if (c.req.header("if-none-match") === etag)
			return new Response(null, { status: 304, headers: { ...headers, etag } });
		return new Response(Bun.file(pageObjectPath(config.home, file.sha256)), {
			headers: {
				...headers,
				etag,
				"content-type": file.mime,
				"content-length": String(file.size),
			},
		});
	};
