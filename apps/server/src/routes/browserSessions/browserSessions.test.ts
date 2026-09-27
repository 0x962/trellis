import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { browserSessionAuth } from "../../auth/browserSessionAuth.ts";
import { BROWSER_SESSION_COOKIE, BrowserSessionStore } from "../../services/browserSessions/index.ts";
import { browserSessionAdminRoutes, browserSessionPublicRoutes } from "./browserSessions.ts";

const origin = "https://trellis.example.com";
const hostToken = "host-token";

const fixture = () => {
	const sessions = new BrowserSessionStore({ hostId: "host-a" });
	const routes = new Hono();
	routes.route("/api/browser-sessions", browserSessionPublicRoutes({ origin, sessions }));
	routes.route("/api/browser-sessions", browserSessionAdminRoutes({ hostToken, sessions }));
	const protectedApp = new Hono();
	protectedApp.use(browserSessionAuth(hostToken, { origin, sessions }));
	protectedApp.post("/api/write", (c) => c.text("written"));
	return { routes, protectedApp, sessions };
};

const issueCode = async (app: Hono) => {
	const response = await app.request("/api/browser-sessions/code", {
		method: "POST",
		headers: { authorization: `Bearer ${hostToken}` },
	});
	return { response, body: (await response.json()) as { code: string; expiresAt: string } };
};

const cookieHeader = (response: Response) => response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";

describe("browser session routes", () => {
	test("issues a login code only to a bearer client", async () => {
		const { routes } = fixture();
		expect((await routes.request("/api/browser-sessions/code", { method: "POST" })).status).toBe(401);
		const { response, body } = await issueCode(routes);
		expect(response.status).toBe(201);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body.code).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
		expect(response.url).not.toContain(body.code);
	});

	test("rejects missing, null, and foreign login origins", async () => {
		const { routes } = fixture();
		const { body } = await issueCode(routes);
		for (const requestOrigin of [undefined, "null", "https://foreign.example"]) {
			const headers: Record<string, string> = { "content-type": "application/json" };
			if (requestOrigin !== undefined) headers.origin = requestOrigin;
			const response = await routes.request("/api/browser-sessions/login", {
				method: "POST",
				headers,
				body: JSON.stringify({ code: body.code }),
			});
			expect(response.status).toBe(403);
		}
	});

	test("limits repeated login guesses", async () => {
		const sessions = new BrowserSessionStore({ hostId: "host-a", guessLimit: 1 });
		const routes = new Hono();
		routes.route("/api/browser-sessions", browserSessionPublicRoutes({ origin, sessions }));
		const request = () =>
			routes.request("/api/browser-sessions/login", {
				method: "POST",
				headers: { "content-type": "application/json", origin },
				body: JSON.stringify({ code: "unknown.secret" }),
			});
		expect((await request()).status).toBe(401);
		const limited = await request();
		expect(limited.status).toBe(429);
		expect(limited.headers.get("retry-after")).not.toBeNull();
	});

	test("rejects an invalid or large login body", async () => {
		const { routes } = fixture();
		expect(
			(
				await routes.request("/api/browser-sessions/login", {
					method: "POST",
					headers: { "content-type": "application/json", origin },
					body: "not-json",
				})
			).status,
		).toBe(400);
		expect(
			(
				await routes.request("/api/browser-sessions/login", {
					method: "POST",
					headers: { "content-type": "application/json", origin },
					body: JSON.stringify({ code: "x".repeat(1024) }),
				})
			).status,
		).toBe(413);
	});

	test("sets a host-only cookie and consumes the code", async () => {
		const { routes } = fixture();
		const { body } = await issueCode(routes);
		const login = await routes.request("/api/browser-sessions/login", {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({ code: body.code }),
		});
		expect(login.status).toBe(201);
		const setCookie = login.headers.get("set-cookie") ?? "";
		expect(setCookie).toContain(`${BROWSER_SESSION_COOKIE}=`);
		expect(setCookie).toContain("Path=/");
		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("Secure");
		expect(setCookie).toContain("SameSite=Strict");
		expect(setCookie).not.toContain("Domain=");
		const responseBody = JSON.stringify(await login.json());
		expect(responseBody).not.toContain(cookieHeader(login).split("=")[1]!);

		const reused = await routes.request("/api/browser-sessions/login", {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({ code: body.code }),
		});
		expect(reused.status).toBe(401);
	});

	test("revokes a session with bearer authentication", async () => {
		const { routes, protectedApp } = fixture();
		const { body } = await issueCode(routes);
		const login = await routes.request("/api/browser-sessions/login", {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({ code: body.code }),
		});
		const session = (await login.clone().json()) as { sessionId: string };
		const cookie = cookieHeader(login);
		expect(
			(await protectedApp.request("/api/write", { method: "POST", headers: { cookie, origin } })).status,
		).toBe(200);
		expect(
			(
				await routes.request(`/api/browser-sessions/${session.sessionId}`, {
					method: "DELETE",
					headers: { authorization: `Bearer ${hostToken}` },
				})
			).status,
		).toBe(204);
		expect(
			(await protectedApp.request("/api/write", { method: "POST", headers: { cookie, origin } })).status,
		).toBe(401);
	});

	test("logs out only from the exact origin", async () => {
		const { routes, protectedApp } = fixture();
		const { body } = await issueCode(routes);
		const login = await routes.request("/api/browser-sessions/login", {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({ code: body.code }),
		});
		const cookie = cookieHeader(login);
		expect(
			(await routes.request("/api/browser-sessions/logout", { method: "POST", headers: { cookie } })).status,
		).toBe(403);
		const logout = await routes.request("/api/browser-sessions/logout", {
			method: "POST",
			headers: { cookie, origin },
		});
		expect(logout.status).toBe(204);
		expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(
			(await protectedApp.request("/api/write", { method: "POST", headers: { cookie, origin } })).status,
		).toBe(401);
	});

	test("refuses a non-HTTPS public origin", () => {
		const sessions = new BrowserSessionStore({ hostId: "host-a" });
		expect(() => browserSessionPublicRoutes({ origin: "http://trellis.example.com", sessions })).toThrow();
	});
});
