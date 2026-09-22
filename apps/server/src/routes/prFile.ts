import type { PullRequestFile } from "@trellis/api";
import type { Context } from "hono";
import type { Config } from "../config.ts";
import type { RequestContext } from "../context.ts";
import type { ServiceTransport } from "../db/transport.ts";
import { createDbTiming, serverTimingHeader } from "../serverTiming.ts";
import { contentDisposition } from "../services/attachments.ts";
import { blobPath } from "../storage/blobs.ts";

export const prFileRoute =
	({ config, transport }: { config: Config; transport: ServiceTransport }) =>
	async (c: Context) => {
		const ctx: RequestContext = { actor: null, session: null, reqId: c.get("requestId"), now: new Date() };
		const timing = createDbTiming();
		const file = (await transport.call(
			"pullRequests.readFile",
			ctx,
			{ fileId: c.req.param("fileId") },
			timing,
		)) as PullRequestFile;
		const etag = `"${file.sha256}"`;
		const headers: Record<string, string> = {
			etag,
			"server-timing": serverTimingHeader(timing),
			"cache-control": "private, max-age=300",
			"x-content-type-options": "nosniff",
			"content-security-policy": "sandbox",
		};
		if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers });
		return new Response(Bun.file(blobPath(config.home, file.sha256)), {
			headers: {
				...headers,
				"content-type": file.mime,
				"content-length": String(file.size),
				"content-disposition": contentDisposition(file.filename, file.mime),
			},
		});
	};
