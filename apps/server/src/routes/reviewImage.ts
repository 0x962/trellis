import type { Context } from "hono";
import type { ServiceTransport } from "../db/transport";
export const reviewImageRoute = (transport: ServiceTransport) => async (c: Context) => {
	const result = (await transport.call(
		"reviews.image",
		{ actor: null, session: null, reqId: c.get("requestId"), now: new Date() },
		{ url: c.req.query("url") ?? "" },
	)) as { type: string; data: string };
	return new Response(Buffer.from(result.data, "base64"), {
		headers: {
			"content-type": result.type,
			"cache-control": "private, max-age=300",
			"x-content-type-options": "nosniff",
			"content-security-policy": "sandbox",
		},
	});
};
