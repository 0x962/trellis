import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { hostAuth } from "./auth.ts";

describe("host auth", () => {
	test("requires the host token for protected reads", async () => {
		const app = new Hono();
		app.use(hostAuth("host-token"));
		app.get("/api/health", (c) => c.json({ ok: true }));
		app.get("/api/host-identity", (c) => c.json({ ok: true }));

		for (const path of ["/api/health", "/api/host-identity"]) {
			const unauthorized = await app.request(path);
			expect(unauthorized.status).toBe(401);
			expect(unauthorized.headers.get("WWW-Authenticate")).toBe("Bearer");
			expect((await app.request(path, { headers: { authorization: "Bearer host-token" } })).status).toBe(200);
		}
	});

	test("keeps unauthenticated local reads when no host token exists", async () => {
		const app = new Hono();
		app.use(hostAuth(null));
		app.get("/api/health", (c) => c.json({ ok: true }));

		expect((await app.request("/api/health")).status).toBe(200);
	});
});
