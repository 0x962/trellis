import type { Context } from "hono";
import type { RequestContext } from "../context.ts";
import type { ServiceTransport } from "../db/transport.ts";

// GET /api/export streams every table as NDJSON. The body starts before
// the first table is read and is never held in memory as a whole.
export const exportRoute =
	({ transport }: { transport: ServiceTransport }) =>
	async (c: Context) => {
		const ctx: RequestContext = { actor: null, session: null, reqId: c.get("requestId"), now: new Date() };
		const lines = (await transport.call("system.export", ctx, {})) as ReadableStream<Uint8Array>;
		const stamp = ctx.now.toISOString().replace(/[:.]/g, "-");
		return new Response(lines, {
			headers: {
				"content-type": "application/x-ndjson",
				"content-disposition": `attachment; filename="trellis-${stamp}.ndjson"`,
			},
		});
	};
