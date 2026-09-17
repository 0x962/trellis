import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

// Refuses a request that carries no host token, a wrong host token, or a
// foreign browser origin. Each refusal body holds the four keys of every
// error body the server writes: `defined`, `code`, `status`, `message`.
// `defined` is false because the API contract in packages/api declares no
// UNAUTHORIZED code and no FORBIDDEN code.
export const hostAuth =
	(token: string | null): MiddlewareHandler =>
	async (c, next) => {
		if (token === null) return next();
		const actual = Buffer.from(c.req.header("authorization") ?? "");
		const expected = Buffer.from(`Bearer ${token}`);
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
			return c.json(
				{
					defined: false,
					code: "UNAUTHORIZED",
					status: 401,
					message: "The Trellis host token is missing or incorrect.",
				},
				401,
			);
		}
		const origin = c.req.header("origin");
		if (origin !== undefined && origin !== new URL(c.req.url).origin) {
			return c.json(
				{ defined: false, code: "FORBIDDEN", status: 403, message: "This origin cannot access the Trellis host." },
				403,
			);
		}
		await next();
	};
