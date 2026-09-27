import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { Fields, Logger } from "../../../log.ts";
import { BrowserSessionStore } from "../../../services/browserSessions/index.ts";
import { browserSessionHostRoutes } from "./browserSessionHostRoutes.ts";

const hostToken = "host-token";

const fixture = () => {
	const records: Fields[] = [];
	const log = { info: (_message: string, fields?: Fields) => records.push(fields ?? {}) } as unknown as Logger;
	const sessions = new BrowserSessionStore({ hostId: "host-a", log });
	const routes = new Hono();
	routes.route("/", browserSessionHostRoutes({ hostToken, sessions, log }));
	return { routes, sessions, records };
};

const issueCode = async (app: Hono) => {
	const response = await app.request("/api/browser-session-codes", {
		method: "POST",
		headers: { authorization: `Bearer ${hostToken}` },
	});
	return { response, body: (await response.json()) as { id: string; code: string; expiresAt: string } };
};

describe("browser session host routes", () => {
	test("issues a login code only to a bearer client", async () => {
		const { routes } = fixture();
		const refused = await routes.request("/api/browser-session-codes", { method: "POST" });
		expect(refused.status).toBe(401);
		expect(refused.headers.get("www-authenticate")).toBe('Bearer realm="Trellis"');
		const { response, body } = await issueCode(routes);
		expect(response.status).toBe(201);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("location")).toBe(`/api/browser-session-codes/${body.id}`);
		expect(body.code).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
		expect(response.headers.get("location")).not.toContain(body.code);
	});

	test("revokes a session and logs no credential", async () => {
		const { routes, sessions, records } = fixture();
		const login = sessions.redeemCode(sessions.issueCode().code);
		if (login.kind !== "session") throw new Error("The browser session fixture failed.");
		const response = await routes.request(`/api/browser-sessions/${login.session.id}`, {
			method: "DELETE",
			headers: { authorization: `Bearer ${hostToken}` },
		});
		expect(response.status).toBe(204);
		expect(sessions.authenticate(login.session.token)).toBeNull();
		const serialized = JSON.stringify(records);
		expect(serialized).not.toContain(login.session.token);
		expect(records).toContainEqual(
			expect.objectContaining({
				hostId: "host-a",
				sessionId: login.session.id,
				action: "session.revoke",
				result: "revoked",
			}),
		);
	});
});
