import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export const hostAuth =
	(token: string | null): MiddlewareHandler =>
	async (c, next) => {
		if (token === null) return next();
		const actual = Buffer.from(c.req.header("authorization") ?? "");
		const expected = Buffer.from(`Bearer ${token}`);
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
			return c.json({ code: "UNAUTHORIZED", message: "The Trellis host token is missing or incorrect." }, 401);
		}
		const origin = c.req.header("origin");
		if (origin !== undefined && origin !== new URL(c.req.url).origin) {
			return c.json({ code: "FORBIDDEN", message: "This origin cannot access the Trellis host." }, 403);
		}
		await next();
	};
