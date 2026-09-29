import type { Context } from "hono";
import type { ServiceTransport } from "../db/transport";
import { readImageStream } from "../services/reviews/image";
export const reviewImageRoute = (transport: ServiceTransport) => async (c: Context) => {
	const stream = (await transport.call(
		"reviews.image",
		{ actor: null, session: null, reqId: c.get("requestId"), now: new Date() },
		{ url: c.req.query("url") ?? "" },
	)) as ReadableStream<Uint8Array>;
	const image = await readImageStream(stream);
	return new Response(image.body, {
		headers: {
			"content-type": image.type,
			"cache-control": "private, max-age=300",
			"x-content-type-options": "nosniff",
			"content-security-policy": "sandbox",
		},
	});
};
