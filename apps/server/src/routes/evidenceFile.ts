import type { Evidence } from "@trellis/api";
import type { Context } from "hono";
import type { Config } from "../config.ts";
import type { RequestContext } from "../context.ts";
import type { ServiceTransport } from "../db/transport.ts";
import { createDbTiming, serverTimingHeader } from "../serverTiming.ts";
import { contentDisposition } from "../services/attachments.ts";
import { blobPath } from "../storage/blobs.ts";

export const evidenceFileRoute =
	({ config, transport }: { config: Config; transport: ServiceTransport }) =>
	async (c: Context) => {
		const ctx: RequestContext = { actor: null, session: null, reqId: c.get("requestId"), now: new Date() };
		const timing = createDbTiming();
		const evidence = (await transport.call(
			"pullRequests.readEvidence",
			ctx,
			{ evidenceId: c.req.param("evidenceId") },
			timing,
		)) as Evidence;
		if (evidence.blob === null) return c.notFound();
		const blob = evidence.blob;
		const etag = `"${blob.sha256}"`;
		const headers: Record<string, string> = {
			etag,
			"server-timing": serverTimingHeader(timing),
			"cache-control": "private, max-age=300",
			"x-content-type-options": "nosniff",
			"content-security-policy": "sandbox",
		};
		if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers });
		return new Response(Bun.file(blobPath(config.home, blob.sha256)), {
			headers: {
				...headers,
				"content-type": blob.mime,
				"content-length": String(blob.size),
				"content-disposition": contentDisposition(blob.filename, blob.mime),
			},
		});
	};
