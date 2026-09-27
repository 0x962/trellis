import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { browserSessionAuth } from "../../../auth/browserSessionAuth/index.ts";
import type { Fields, Logger } from "../../../log.ts";
import { BROWSER_SESSION_COOKIE, BrowserSessionStore } from "../../../services/browserSessions/index.ts";
import { browserSessionBrowserRoutes } from "./browserSessionBrowserRoutes.ts";

const origin = "https://trellis.example.com";
const hostToken = "host-token";

const logger = () => {
	const records: Fields[] = [];
	const log = { info: (_message: string, fields?: Fields) => records.push(fields ?? {}) } as unknown as Logger;
	return { log, records };
};

const fixture = () => {
	const { log, records } = logger();
	const sessions = new BrowserSessionStore({ hostId: "host-a", log });
	const routes = new Hono();
	routes.route("/", browserSessionBrowserRoutes({ origin, sessions, log }));
	const protectedApp = new Hono();
	protectedApp.use(browserSessionAuth(hostToken, { origin, sessions, log }));
	protectedApp.post("/api/write", (c) => c.text("written"));
	return { routes, protectedApp, sessions, log, records };
};

const createSession = (app: Hono, code: string) =>
	app.request("/api/browser-sessions", {
		method: "POST",
		headers: { "content-type": "application/json", origin },
		body: JSON.stringify({ code }),
	});

const cookieHeader = (response: Response) => response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";

describe("browser session browser routes", () => {
	test("rejects missing, null, and foreign origins", async () => {
		const { routes, sessions } = fixture();
		const issued = sessions.issueCode();
		for (const requestOrigin of [undefined, "null", "https://foreign.example"]) {
			const headers: Record<string, string> = { "content-type": "application/json" };
			if (requestOrigin !== undefined) headers.origin = requestOrigin;
			const response = await routes.request("/api/browser-sessions", {
				method: "POST",
				headers,
				body: JSON.stringify({ code: issued.code }),
			});
			expect(response.status).toBe(403);
		}
	});

	test("limits repeated login guesses", async () => {
		const { log } = logger();
		const sessions = new BrowserSessionStore({ hostId: "host-a", log, guessLimit: 1 });
		const routes = new Hono();
		routes.route("/", browserSessionBrowserRoutes({ origin, sessions, log }));
		const request = () => createSession(routes, "unknown.secret");
		expect((await request()).status).toBe(401);
		const limited = await request();
		expect(limited.status).toBe(429);
		expect(limited.headers.get("retry-after")).not.toBeNull();
	});

	test("rejects an invalid or large login body", async () => {
		const { routes } = fixture();
		expect(
			(
				await routes.request("/api/browser-sessions", {
					method: "POST",
					headers: { "content-type": "application/json", origin },
					body: "not-json",
				})
			).status,
		).toBe(400);
		expect(
			(
				await routes.request("/api/browser-sessions", {
					method: "POST",
					headers: { "content-type": "application/json", origin },
					body: JSON.stringify({ code: "x".repeat(1024) }),
				})
			).status,
		).toBe(413);
	});

	test("creates a host-only cookie and consumes the code", async () => {
		const { routes, sessions } = fixture();
		const issued = sessions.issueCode();
		const response = await createSession(routes, issued.code);
		expect(response.status).toBe(201);
		expect(response.headers.get("location")).toMatch(/^\/api\/browser-sessions\/[A-Za-z0-9_-]+$/);
		const setCookie = response.headers.get("set-cookie") ?? "";
		expect(setCookie).toContain(`${BROWSER_SESSION_COOKIE}=`);
		expect(setCookie).toContain("Path=/");
		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("Secure");
		expect(setCookie).toContain("SameSite=Strict");
		expect(setCookie).not.toContain("Domain=");
		const responseBody = JSON.stringify(await response.json());
		expect(responseBody).not.toContain(cookieHeader(response).split("=")[1]!);

		const reused = await createSession(routes, issued.code);
		expect(reused.status).toBe(401);
		expect(reused.headers.get("www-authenticate")).toBe('TrellisLoginCode realm="Trellis"');
	});

	test("logs out only from the exact origin", async () => {
		const { routes, protectedApp, sessions } = fixture();
		const login = await createSession(routes, sessions.issueCode().code);
		const cookie = cookieHeader(login);
		expect(
			(await routes.request("/api/browser-sessions/current", { method: "DELETE", headers: { cookie } })).status,
		).toBe(403);
		const logout = await routes.request("/api/browser-sessions/current", {
			method: "DELETE",
			headers: { cookie, origin },
		});
		expect(logout.status).toBe(204);
		expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(
			(await protectedApp.request("/api/write", { method: "POST", headers: { cookie, origin } })).status,
		).toBe(401);
		const secondLogout = await routes.request("/api/browser-sessions/current", {
			method: "DELETE",
			headers: { cookie, origin },
		});
		expect(secondLogout.headers.get("www-authenticate")).toBe('TrellisSession realm="Trellis"');
	});

	test("logs security events without browser credentials", async () => {
		const { routes, protectedApp, sessions, records } = fixture();
		const issued = sessions.issueCode();
		const login = await createSession(routes, issued.code);
		const cookie = cookieHeader(login);
		await protectedApp.request("/api/write", { method: "POST", headers: { cookie, origin } });
		await routes.request("/api/browser-sessions/current", { method: "DELETE", headers: { cookie, origin } });
		const serialized = JSON.stringify(records);
		expect(serialized).not.toContain(issued.code);
		expect(serialized).not.toContain(cookie.split("=")[1]!);
		expect(records).toContainEqual(
			expect.objectContaining({ hostId: "host-a", action: "code.redeem", result: "redeemed" }),
		);
		expect(records).toContainEqual(
			expect.objectContaining({ hostId: "host-a", action: "session.authenticate", result: "cookie-accepted" }),
		);
		expect(records).toContainEqual(
			expect.objectContaining({ hostId: "host-a", action: "session.logout", result: "logged-out" }),
		);
	});

	test("refuses a non-HTTPS browser origin", () => {
		const { log } = logger();
		const sessions = new BrowserSessionStore({ hostId: "host-a", log });
		expect(() => browserSessionBrowserRoutes({ origin: "http://trellis.example.com", sessions, log })).toThrow();
	});
});
