import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { ServiceTransport } from "../../db/transport.ts";
import type { Logger } from "../../log.ts";
import { reviewImageRoute } from "../../routes/reviewImage.ts";
import type { PrepareCtx } from "../support.ts";
import { image } from "./image.ts";

const sourceUrl = "https://github.com/example/trellis/blob/main/review.png";
const sourceBytes = 10 * 1024 * 1024 + 1;
const ctx = {} as PrepareCtx;

const deps = (response: Response) => ({
	fetch: async () => response,
	token: async () => "github-token",
});

const routeResponse = async (stream: ReadableStream<Uint8Array>) => {
	const transport = { call: async () => stream } as unknown as ServiceTransport;
	const errors: Array<[string, Record<string, unknown> | undefined]> = [];
	const log: Logger = {
		level: "error",
		debug() {},
		info() {},
		warn() {},
		error(message, fields) {
			errors.push([message, fields]);
		},
		close() {},
	};
	const app = new Hono();
	app.use(async (c, next) => {
		c.set("requestId", "review-image-test");
		await next();
	});
	app.get("/api/review-image", reviewImageRoute({ transport, log }));
	return { response: await app.request(`/api/review-image?url=${encodeURIComponent(sourceUrl)}`), errors };
};

describe("review images", () => {
	test("streams an image above 10 MiB with its media type", async () => {
		let remaining = sourceBytes;
		const upstream = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (remaining === 0) {
					controller.close();
					return;
				}
				const size = Math.min(1024 * 1024, remaining);
				remaining -= size;
				controller.enqueue(new Uint8Array(size).fill(7));
			},
		});
		const stream = await image(
			ctx,
			{ url: sourceUrl },
			deps(new Response(upstream, { headers: { "content-type": "image/png; charset=binary" } })),
		);
		const { response } = await routeResponse(stream);
		expect(remaining).toBeGreaterThan(0);
		const reader = response.body!.getReader();
		let received = 0;
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			received += chunk.value.byteLength;
			expect(chunk.value.every((byte) => byte === 7)).toBe(true);
		}
		expect(received).toBe(sourceBytes);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("content-security-policy")).toBe("sandbox");
	});

	test("rejects an unsupported media type before it reads the body", async () => {
		let pulled = false;
		const body = new ReadableStream<Uint8Array>(
			{
				pull() {
					pulled = true;
				},
			},
			{ highWaterMark: 0 },
		);
		await expect(
			image(ctx, { url: sourceUrl }, deps(new Response(body, { headers: { "content-type": "text/html" } }))),
		).rejects.toThrow("The URL does not serve a supported image.");
		expect(pulled).toBe(false);
	});

	test("passes an interrupted source error to the response reader", async () => {
		const interruption = new Error("source interrupted");
		let read = false;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (!read) {
					read = true;
					controller.enqueue(Uint8Array.of(1, 2, 3));
					return;
				}
				controller.error(interruption);
			},
		});
		const stream = await image(
			ctx,
			{ url: sourceUrl },
			deps(new Response(body, { headers: { "content-type": "image/webp" } })),
		);
		const { response, errors } = await routeResponse(stream);
		const reader = response.body!.getReader();
		expect(await reader.read()).toEqual({ done: false, value: Uint8Array.of(1, 2, 3) });
		await expect(reader.read()).rejects.toBe(interruption);
		expect(errors).toEqual([["review image failed", { reqId: "review-image-test", message: "source interrupted" }]]);
	});

	test("cancels the source when the response reader cancels", async () => {
		let reason: unknown;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(Uint8Array.of(1));
			},
			cancel(value) {
				reason = value;
			},
		});
		const stream = await image(
			ctx,
			{ url: sourceUrl },
			deps(new Response(body, { headers: { "content-type": "image/jpeg" } })),
		);
		const { response } = await routeResponse(stream);
		await response.body!.cancel("client stopped");
		expect(reason).toBe("client stopped");
	});

	test("keeps source and redirect hosts restricted", async () => {
		let fetched = false;
		await expect(
			image(
				ctx,
				{ url: "https://example.com/review.png" },
				{
					fetch: async () => {
						fetched = true;
						return new Response();
					},
					token: async () => "github-token",
				},
			),
		).rejects.toThrow("Use a GitHub image URL.");
		expect(fetched).toBe(false);

		await expect(
			image(
				ctx,
				{ url: sourceUrl },
				deps(new Response(null, { status: 302, headers: { location: "https://example.com/review.png" } })),
			),
		).rejects.toThrow("GitHub redirected this image to an unsupported host.");
	});

	test("reports a normal upstream HTTP error", async () => {
		await expect(image(ctx, { url: sourceUrl }, deps(new Response(null, { status: 404 })))).rejects.toThrow(
			"GitHub returned HTTP 404 for this image.",
		);
	});
});
