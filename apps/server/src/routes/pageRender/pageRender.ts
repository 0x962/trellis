import type { Context } from "hono";
import type { Logger } from "../../log.ts";
import { extendRenderLease, type PAGE_RENDER_PREFIX, renderContentRoot } from "../../pageLeases.ts";
import { frameRelayScript } from "../../services/pages/renderScript";
import { errorBody, framePolicy, guardHeaders, originOf } from "./policy.ts";

// A page holds untrusted HTML. Its own policy cannot stop its scripts from
// sending the frame they run in to another site, and an address is enough to
// carry the content of the page away. A frame policy on the document that
// holds it can stop that, so Trellis serves this fixed document, gives it a
// `frame-src` of the one lease path, and puts the page inside it.
//
// The document loads no stylesheet and its policy permits no address, so it
// can read no colour token. A transparent ground shows the ground of the
// viewer that mounts the frame, in the light theme and in the dark one, and
// the page paints its own ground over it.
const frameDocument = (root: string, nonce: string) =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page</title>` +
	`<style>html,body{margin:0;height:100%;background:transparent}iframe{display:block;border:0;width:100%;height:100%}</style>` +
	`</head><body><iframe src="${root}" sandbox="allow-scripts" referrerpolicy="no-referrer" ` +
	`title="Page content"></iframe>${frameRelayScript(nonce)}</body></html>`;

// GET /api/page-render/{leaseId} draws the frame document.
export const pageFrameRoute =
	({ log }: { log: Logger }) =>
	async (c: Context<Record<string, never>, `${typeof PAGE_RENDER_PREFIX}/:leaseId`>) => {
		const lease = extendRenderLease(c.req.param("leaseId"), new Date());
		if (lease === undefined) {
			log.warn("page render refused", { reqId: c.get("requestId"), reason: "no render lease" });
			return c.json(errorBody("RENDER_LEASE_EXPIRED"), 404);
		}
		const root = renderContentRoot(lease.id);
		return c.html(frameDocument(root, lease.nonce), 200, {
			...guardHeaders(),
			"cache-control": "no-store",
			"content-security-policy": framePolicy(originOf(c), root, lease.nonce),
		});
	};
