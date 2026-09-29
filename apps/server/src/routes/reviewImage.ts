import type { Context } from "hono";
import { decodeReviewImage } from "../db/reviewImageStream.ts";
import type { ServiceTransport } from "../db/transport";
import type { Logger } from "../log.ts";

const logBodyErrors = (source: ReadableStream<Uint8Array>, reqId: string, log: Logger) => {
	const reader = source.getReader();
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const chunk = await reader.read();
				if (chunk.done) controller.close();
				else controller.enqueue(chunk.value);
			} catch (error) {
				log.error("review image failed", {
					reqId,
					message: error instanceof Error ? error.message : String(error),
				});
				controller.error(error);
			}
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});
};

export const reviewImageRoute =
	({ transport, log }: { transport: ServiceTransport; log: Logger }) =>
	async (c: Context) => {
		const reqId = c.get("requestId");
		const stream = (await transport.call(
			"reviews.image",
			{ actor: null, session: null, reqId, now: new Date() },
			{ url: c.req.query("url") ?? "" },
		)) as ReadableStream<Uint8Array>;
		const image = await decodeReviewImage(stream);
		return new Response(logBodyErrors(image.body, reqId, log), {
			headers: {
				"content-type": image.type,
				"cache-control": "private, max-age=300",
				"x-content-type-options": "nosniff",
				"content-security-policy": "sandbox",
			},
		});
	};
