import type { Attachment, ChatAttachment } from "@trellis/api";
import type { Context } from "hono";
import type { Config } from "../config.ts";
import type { RequestContext } from "../context.ts";
import type { ServiceTransport } from "../db/transport.ts";
import { createDbTiming, serverTimingHeader } from "../serverTiming.ts";
import { contentDisposition } from "../services/attachments.ts";
import { blobPath } from "../storage/blobs.ts";

// GET /api/attachments/{id}/file and GET /api/chat/attachments/{id}/file
// serve the stored bytes of a ticket attachment and of a chat attachment.
// The ETag is the hash, so a browser that holds the file never downloads it
// again. The sandbox policy and nosniff keep an uploaded file from running
// as script on the app origin. A type outside the inline allowlist downloads.
export const filesRoute =
	({
		config,
		transport,
		service = "attachments.get",
	}: {
		config: Config;
		transport: ServiceTransport;
		service?: "attachments.get" | "chat.attachment";
	}) =>
	async (c: Context) => {
		const ctx: RequestContext = { actor: null, session: null, reqId: c.get("requestId"), now: new Date() };
		const timing = createDbTiming();
		const attachment = (await transport.call(service, ctx, { id: c.req.param("id") }, timing)) as
			| Attachment
			| ChatAttachment;
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
