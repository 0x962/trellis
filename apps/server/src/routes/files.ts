import type { Attachment } from "@trellis/api";
import type { Context } from "hono";
import type { Config } from "../config.ts";
import type { RequestContext } from "../context.ts";
import type { ServiceTransport } from "../db/transport.ts";
import { createDbTiming, serverTimingHeader } from "../serverTiming.ts";
import { contentDisposition } from "../services/attachments.ts";
import { blobPath } from "../storage/blobs.ts";

// GET /api/attachments/{id}/file serves the stored bytes of a ticket
// attachment. The ETag prevents a second download when the browser holds the
// file. The sandbox policy and nosniff prevent script execution on the app
// origin. A type outside the inline allowlist downloads.
export const filesRoute =
	({ config, transport }: { config: Config; transport: ServiceTransport }) =>
	async (c: Context) => {
		const ctx: RequestContext = { actor: null, session: null, reqId: c.get("requestId"), now: new Date() };
		const timing = createDbTiming();
		const attachment = (await transport.call("attachments.get", ctx, { id: c.req.param("id") }, timing)) as Attachment;
		const etag = `"${attachment.sha256}"`;
		const headers: Record<string, string> = {
			etag,
			"server-timing": serverTimingHeader(timing),
			"cache-control": "private, max-age=31536000, immutable",
			"x-content-type-options": "nosniff",
			"content-security-policy": "sandbox",
		};
		if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers });
		return new Response(Bun.file(blobPath(config.home, attachment.sha256)), {
			headers: {
				...headers,
				"content-type": attachment.mime,
				"content-length": String(attachment.size),
				"content-disposition": contentDisposition(attachment.filename, attachment.mime),
			},
		});
	};
