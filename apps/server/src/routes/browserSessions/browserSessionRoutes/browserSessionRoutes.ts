import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { browserSessionOrigin } from "../../../auth/browserSessionAuth/index.ts";
import type { Logger } from "../../../log.ts";
import {
	type BrowserSessionStore,
	browserSessionCookie,
	createBrowserSession,
	endBrowserSession,
	expiredBrowserSessionCookie,
	readBrowserSessionCookie,
	recordOversizedBrowserSessionRequest,
} from "../../../services/browserSessions/index.ts";
import { errorResponse, noStore, unauthorizedResponse } from "../response/index.ts";

export type BrowserSessionRoutesOptions = {
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

export const browserSessionRoutes = (options: BrowserSessionRoutesOptions) => {
	const origin = browserSessionOrigin(options.origin);
	const app = new Hono();
	app.use(
		"/api/browser-sessions",
		bodyLimit({
			maxSize: 1024,
			onError: (c) => {
				recordOversizedBrowserSessionRequest({
					reqId: c.get("requestId") ?? null,
					sessions: options.sessions,
					log: options.log,
				});
				return errorResponse(c, 413, "PAYLOAD_TOO_LARGE", "The browser login request is too large.");
			},
		}),
	);

	app.post("/api/browser-sessions", async (c) => {
		const code = await readLoginCode(c);
		const result = createBrowserSession({
			origin: c.req.header("origin"),
			expectedOrigin: origin,
			code,
			reqId: c.get("requestId") ?? null,
			sessions: options.sessions,
			log: options.log,
		});
		if (result.kind === "forbidden")
			return errorResponse(c, 403, "FORBIDDEN", "This origin cannot create a Trellis browser session.");
		if (result.kind === "bad-request")
			return errorResponse(c, 400, "BAD_REQUEST", "Enter a browser login code.");
		if (result.kind === "rate-limited") {
			const response = errorResponse(c, 429, "TOO_MANY_REQUESTS", "Too many browser login attempts.");
			response.headers.set("retry-after", String(Math.max(1, Math.ceil((result.retryAt - Date.now()) / 1000))));
			return noStore(response);
		}
		if (result.kind === "invalid") {
			return unauthorizedResponse(
				c,
				'TrellisLoginCode realm="Trellis"',
				"The browser login code is invalid or expired.",
			);
		}
		const response = c.json(
			{ sessionId: result.session.id, expiresAt: new Date(result.session.expiresAt).toISOString() },
			201,
		);
		response.headers.set("location", `/api/browser-sessions/${result.session.id}`);
		response.headers.append("set-cookie", browserSessionCookie(result.session.token, result.session.expiresAt));
		return noStore(response);
	});

	app.delete("/api/browser-sessions/current", (c) => {
		const result = endBrowserSession({
			origin: c.req.header("origin"),
			expectedOrigin: origin,
			token: readBrowserSessionCookie(c.req.header("cookie")),
			reqId: c.get("requestId") ?? null,
			sessions: options.sessions,
			log: options.log,
		});
		if (result.kind === "forbidden")
			return errorResponse(c, 403, "FORBIDDEN", "This origin cannot end a Trellis browser session.");
		if (result.kind === "unauthorized") {
			return unauthorizedResponse(
				c,
				'TrellisSession realm="Trellis"',
				"The Trellis browser session is missing or expired.",
			);
		}
		const response = c.body(null, 204);
		response.headers.append("set-cookie", expiredBrowserSessionCookie());
		return noStore(response);
	});

	return app;
};
