import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { Fields, Logger } from "../../log.ts";
import { BrowserSessionStore, browserSessionCookie } from "../../services/browserSessions/index.ts";
import { browserSessionAuth, browserSessionFromContext, browserSessionOrigin } from "./browserSessionAuth.ts";

const origin = "https://trellis.example.com";
const log = { info: () => {} } as unknown as Logger;

const sessionFixture = () => {
	const sessions = new BrowserSessionStore({ hostId: "host-a", log });
	const login = sessions.redeemCode(sessions.issueCode().code);
	if (login.kind !== "session") throw new Error("The browser session fixture failed.");
	return {
		sessions,
		session: login.session,
		cookie: browserSessionCookie(login.session.token, login.session.expiresAt).split(";", 1)[0]!,
	};
};

const protectedApp = () => {
	const fixture = sessionFixture();
	const app = new Hono();
	app.use(browserSessionAuth("host-token", { origin, sessions: fixture.sessions, log }));
	app.get("/download", (c) => c.text("download"));
	app.get("/socket", (c) => c.text("socket"));
	app.post("/write", (c) => c.text("write"));
	return { app, ...fixture };
};

describe("browser session auth", () => {
	test("keeps bearer clients separate from cookie CSRF checks", async () => {
		const { app } = protectedApp();
		expect(
			(
				await app.request("/write", {
					method: "POST",
					headers: { authorization: "Bearer host-token" },
				})
			).status,
		).toBe(200);
		expect(
			(
				await app.request("/write", {
					method: "POST",
					headers: { authorization: "Bearer host-token", origin: "https://foreign.example" },
				})
			).status,
		).toBe(403);
	});

	test("requires the exact origin for cookie writes", async () => {
		const { app, cookie } = protectedApp();
		for (const requestOrigin of [undefined, "null", "https://foreign.example"]) {
			const headers: Record<string, string> = { cookie };
			if (requestOrigin !== undefined) headers.origin = requestOrigin;
			expect((await app.request("/write", { method: "POST", headers })).status).toBe(403);
		}
		expect(
			(await app.request("/write", { method: "POST", headers: { cookie, origin } })).status,
		).toBe(200);
	});

	test("rejects a hostile Page frame with an ambient cookie", async () => {
		const { app, cookie } = protectedApp();
		const response = await app.request("/write", {
			method: "POST",
			headers: { cookie, origin: "null", "sec-fetch-dest": "empty" },
		});
		expect(response.status).toBe(403);
	});

	test("authenticates a download without an Origin header", async () => {
		const { app, cookie } = protectedApp();
		const response = await app.request("/download", { headers: { cookie } });
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("download");
	});

	test("exposes the cookie session to a protected route", async () => {
		const fixture = sessionFixture();
		const app = new Hono();
		app.use(browserSessionAuth("host-token", { origin, sessions: fixture.sessions, log }));
		app.get("/session", (c) => c.json(browserSessionFromContext(c)));
		const response = await app.request("/session", { headers: { cookie: fixture.cookie } });
		expect(await response.json()).toEqual({ id: fixture.session.id, expiresAt: fixture.session.expiresAt });
	});

	test("requires the exact origin for a cookie WebSocket upgrade", async () => {
		const { app, cookie } = protectedApp();
		for (const requestOrigin of [undefined, "null", "https://foreign.example"]) {
			const headers: Record<string, string> = { cookie, upgrade: "websocket" };
			if (requestOrigin !== undefined) headers.origin = requestOrigin;
			expect((await app.request("/socket", { headers })).status).toBe(403);
		}
		expect(
			(await app.request("/socket", { headers: { cookie, origin, upgrade: "websocket" } })).status,
		).toBe(200);
	});

	test("rejects expired and revoked cookies", async () => {
		let now = 1_000;
		const sessions = new BrowserSessionStore({ hostId: "host-a", log, now: () => now, sessionTtlMs: 100 });
		const login = sessions.redeemCode(sessions.issueCode().code);
		if (login.kind !== "session") throw new Error("The browser session fixture failed.");
		const cookie = browserSessionCookie(login.session.token, login.session.expiresAt).split(";", 1)[0]!;
		const app = new Hono();
		app.use(browserSessionAuth("host-token", { origin, sessions, log }));
		app.get("/read", (c) => c.text("read"));
		now += 100;
		const response = await app.request("/read", { headers: { cookie } });
		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toContain('TrellisSession realm="Trellis"');
	});

	test("logs authentication without the cookie token", async () => {
		const records: Fields[] = [];
		const eventLog = {
			info: (_message: string, fields?: Fields) => records.push(fields ?? {}),
		} as unknown as Logger;
		const sessions = new BrowserSessionStore({ hostId: "host-a", log: eventLog });
		const login = sessions.redeemCode(sessions.issueCode().code);
		if (login.kind !== "session") throw new Error("The browser session fixture failed.");
		const cookie = browserSessionCookie(login.session.token, login.session.expiresAt).split(";", 1)[0]!;
		const app = new Hono();
		app.use(browserSessionAuth("host-token", { origin, sessions, log: eventLog }));
		app.get("/read", (c) => c.text("read"));
		expect((await app.request("/read", { headers: { cookie } })).status).toBe(200);
		expect(records).toContainEqual(
			expect.objectContaining({
				hostId: "host-a",
				sessionId: login.session.id,
				action: "session.authenticate",
				result: "cookie-accepted",
			}),
		);
		expect(JSON.stringify(records)).not.toContain(login.session.token);
	});

	test("logs bearer results after host authentication", async () => {
		const records: Fields[] = [];
		const eventLog = {
			info: (_message: string, fields?: Fields) => records.push(fields ?? {}),
		} as unknown as Logger;
		const sessions = new BrowserSessionStore({ hostId: "host-a", log: eventLog });
		const app = new Hono();
		app.use(browserSessionAuth("host-token", { origin, sessions, log: eventLog }));
		app.get("/read", (c) => c.text("read"));

		await app.request("/read", { headers: { authorization: "Bearer host-token" } });
		await app.request("/read", { headers: { authorization: "Bearer wrong" } });
		await app.request("/read", {
			headers: { authorization: "Bearer host-token", origin: "https://foreign.example" },
		});

		expect(records).toContainEqual(expect.objectContaining({ hostId: "host-a", result: "bearer-accepted" }));
		expect(records).toContainEqual(expect.objectContaining({ hostId: "host-a", result: "bearer-rejected" }));
		expect(records).toContainEqual(expect.objectContaining({ hostId: "host-a", result: "origin-rejected" }));
	});

	test("uses the bearer-only middleware when browser sessions are off", async () => {
		const app = new Hono();
		app.use(browserSessionAuth("host-token", null));
		app.get("/read", (c) => c.text("read"));
		expect((await app.request("/read")).status).toBe(401);
		expect((await app.request("/read", { headers: { authorization: "Bearer host-token" } })).status).toBe(200);
	});

	test("accepts only a complete HTTPS origin", () => {
		expect(browserSessionOrigin(origin)).toBe(origin);
		expect(browserSessionOrigin(`${origin}/`)).toBe(origin);
		expect(browserSessionOrigin("https://trellis.example.com:443")).toBe(origin);
		expect(() => browserSessionOrigin("http://trellis.example.com")).toThrow();
		expect(() => browserSessionOrigin(`${origin}/app`)).toThrow();
	});

	test("requires bearer authentication when browser sessions are on", () => {
		const sessions = new BrowserSessionStore({ hostId: "host-a", log });
		expect(() => browserSessionAuth(null, { origin, sessions, log })).toThrow();
	});
});
