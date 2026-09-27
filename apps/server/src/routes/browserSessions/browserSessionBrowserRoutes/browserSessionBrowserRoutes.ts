import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Logger } from "../../../log.ts";
import {
	browserSessionOrigin,
	requestHasBrowserOrigin,
} from "../../../auth/browserSessionAuth/index.ts";
import {
	type BrowserSessionStore,
	browserSessionCookie,
	expiredBrowserSessionCookie,
	logoutBrowserSession,
	readBrowserSessionCookie,
} from "../../../services/browserSessions/index.ts";
import { errorResponse, noStore, unauthorizedResponse } from "../response/index.ts";

export type BrowserSessionBrowserRoutesOptions = {
	origin: string;
	sessions: BrowserSessionStore;
	log: Logger;
};

const readLoginCode = async (c: Context) => {
	try {
		const body = (await c.req.json()) as { code?: unknown };
		return typeof body.code === "string" && body.code !== "" ? body.code : null;
	} catch {
		return null;
	}
};

export const browserSessionBrowserRoutes = (options: BrowserSessionBrowserRoutesOptions) => {
	const origin = browserSessionOrigin(options.origin);
	const app = new Hono();
	const securityEvent = (c: Context, sessionId: string | null, action: string, result: string) =>
		options.log.info("browser session security", {
			hostId: options.sessions.hostId,
			reqId: c.get("requestId") ?? null,
			sessionId,
			action,
			result,
		});
	app.use(
		"/api/browser-sessions",
		bodyLimit({
			maxSize: 1024,
			onError: (c) => {
				securityEvent(c, null, "session.create", "payload-too-large");
				return errorResponse(c, 413, "PAYLOAD_TOO_LARGE", "The browser login request is too large.");
			},
		}),
	);

	app.post("/api/browser-sessions", async (c) => {
		if (!requestHasBrowserOrigin(c, origin)) {
			securityEvent(c, null, "session.create", "origin-rejected");
			return errorResponse(c, 403, "FORBIDDEN", "This origin cannot create a Trellis browser session.");
		}
		const code = await readLoginCode(c);
		if (code === null) {
			securityEvent(c, null, "session.create", "bad-request");
			return errorResponse(c, 400, "BAD_REQUEST", "Enter a browser login code.");
		}
		const result = options.sessions.redeemCode(code);
		if (result.kind === "rate-limited") {
			securityEvent(c, null, "code.redeem", "rate-limited");
			const response = errorResponse(c, 429, "TOO_MANY_REQUESTS", "Too many browser login attempts.");
			response.headers.set("retry-after", String(Math.max(1, Math.ceil((result.retryAt - Date.now()) / 1000))));
			return noStore(response);
		}
		if (result.kind === "invalid") {
			securityEvent(c, null, "code.redeem", "rejected");
			return unauthorizedResponse(
				c,
				'TrellisLoginCode realm="Trellis"',
				"The browser login code is invalid or expired.",
			);
		}
		securityEvent(c, result.session.id, "code.redeem", "redeemed");
		const response = c.json(
			{ sessionId: result.session.id, expiresAt: new Date(result.session.expiresAt).toISOString() },
			201,
		);
		response.headers.set("location", `/api/browser-sessions/${result.session.id}`);
		response.headers.append("set-cookie", browserSessionCookie(result.session.token, result.session.expiresAt));
		return noStore(response);
	});

	app.delete("/api/browser-sessions/current", (c) => {
		if (!requestHasBrowserOrigin(c, origin)) {
			securityEvent(c, null, "session.logout", "origin-rejected");
			return errorResponse(c, 403, "FORBIDDEN", "This origin cannot end a Trellis browser session.");
		}
		const result = logoutBrowserSession(options.sessions, readBrowserSessionCookie(c.req.header("cookie")));
		if (result.kind === "unauthorized") {
			securityEvent(c, null, "session.logout", "unauthorized");
			return unauthorizedResponse(
				c,
				'TrellisSession realm="Trellis"',
				"The Trellis browser session is missing or expired.",
			);
		}
		securityEvent(c, result.sessionId, "session.logout", "logged-out");
		const response = c.body(null, 204);
		response.headers.append("set-cookie", expiredBrowserSessionCookie());
		return noStore(response);
	});

	return app;
};
