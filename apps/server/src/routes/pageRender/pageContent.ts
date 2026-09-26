import type { PageContentFile } from "@trellis/api";
import type { Context } from "hono";
import type { Config } from "../../config.ts";
import type { RequestContext } from "../../context.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import type { Logger } from "../../log.ts";
import { extendRenderLease, type PAGE_RENDER_PREFIX, renderContentRoot } from "../../pageLeases.ts";
import { createDbTiming, serverTimingHeader } from "../../serverTiming.ts";
import { renderPageBody } from "../../services/pages/renderPageBody";
import { contentPolicy, errorBody, guardHeaders, originOf } from "./policy.ts";

export type PageContentDeps = { config: Config; transport: ServiceTransport; log: Logger };

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

export const pageContentRoute =
	({ config, transport, log }: PageContentDeps) =>
	async (c: Context<Record<string, never>, `${typeof PAGE_RENDER_PREFIX}/:leaseId/*`>) => {
		const now = new Date();
		const reqId = c.get("requestId");
		const lease = extendRenderLease(c.req.param("leaseId"), now);
		if (lease === undefined) {
			log.warn("page content refused", { reqId, reason: "no render lease" });
			return c.json(errorBody("RENDER_LEASE_EXPIRED"), 404);
		}
		const root = renderContentRoot(lease.id);
		const timing = createDbTiming();
		const headers: Record<string, string> = {
			...guardHeaders(),
			"server-timing": serverTimingHeader(timing),
			"cache-control": "private, no-cache",
			"content-security-policy": contentPolicy(originOf(c), root),
		};
		const raw = new URL(c.req.url).pathname.slice(root.length);
		const path = decodedPath(raw);
		const missing = (reason: string) => {
			log.warn("page content refused", { reqId, reason, pageId: lease.pageId, version: lease.version, path: raw });
			return c.json(errorBody("NOT_FOUND", { kind: "page file", ref: raw }), 404, headers);
		};
		if (path === null) return missing("malformed address");
		const ctx: RequestContext = { actor: null, session: null, reqId, now };
		const file = (await transport.call(
			"pages.versionFile",
			ctx,
			{ pageId: lease.pageId, version: lease.version, path },
			timing,
		)) as PageContentFile;
		headers["server-timing"] = serverTimingHeader(timing);
		if (file.state === "deleted") {
			log.warn("page content refused", { reqId, reason: "page deleted", pageId: lease.pageId });
			return c.json(errorBody("PAGE_DELETED"), 410, headers);
		}
		if (file.state === "missing") return missing("no file at this address");
		const download = c.req.query("download") === "1";
		if (download) headers["content-disposition"] = "attachment";
		const etag = `"${file.sha256}"`;
		if (c.req.header("if-none-match") === etag)
			return new Response(null, { status: 304, headers: { ...headers, etag } });
		const { body, size } = await renderPageBody({ config }, { path, file, nonce: lease.nonce, download });
		return new Response(body, {
			headers: {
				...headers,
				etag,
				"content-type": file.mime,
				...(size === undefined ? {} : { "content-length": String(size) }),
			},
		});
	};
