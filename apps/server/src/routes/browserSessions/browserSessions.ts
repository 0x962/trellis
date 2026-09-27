import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { browserSessionOrigin, requireBrowserOrigin } from "../../auth/browserSessionAuth.ts";
import { hostAuth } from "../../auth/auth.ts";
import {
	type BrowserSessionStore,
	browserSessionCookie,
	expiredBrowserSessionCookie,
	readBrowserSessionCookie,
} from "../../services/browserSessions/index.ts";

export type BrowserSessionPublicRoutesOptions = {
	origin: string;
	sessions: BrowserSessionStore;
};

export type BrowserSessionAdminRoutesOptions = {
	hostToken: string;
	sessions: BrowserSessionStore;
};

const error = (c: Context, status: 400 | 401 | 403 | 413 | 429, code: string, message: string) =>
	c.json({ defined: false, code, status, message }, status);

const noStore = (response: Response) => {
	response.headers.set("cache-control", "no-store");
	response.headers.set("pragma", "no-cache");
	return response;
};

const readLoginCode = async (c: Context) => {
	try {
		const body = (await c.req.json()) as { code?: unknown };
		return typeof body.code === "string" && body.code !== "" ? body.code : null;
	} catch {
		return null;
	}
};

export const browserSessionPublicRoutes = (options: BrowserSessionPublicRoutesOptions) => {
	const origin = browserSessionOrigin(options.origin);
	const app = new Hono();
	app.use(
		"/login",
		bodyLimit({
			maxSize: 1024,
			onError: (c) => error(c, 413, "PAYLOAD_TOO_LARGE", "The browser login request is too large."),
		}),
	);

	app.post("/login", async (c) => {
		if (!requireBrowserOrigin(c, origin)) {
			return error(c, 403, "FORBIDDEN", "This origin cannot create a Trellis browser session.");
		}
		const code = await readLoginCode(c);
		if (code === null) {
			return error(c, 400, "BAD_REQUEST", "Enter a browser login code.");
		}
		const result = options.sessions.redeemCode(code);
		if (result.kind === "rate-limited") {
			const response = error(c, 429, "TOO_MANY_REQUESTS", "Too many browser login attempts.");
			response.headers.set("retry-after", String(Math.max(1, Math.ceil((result.retryAt - Date.now()) / 1000))));
			return noStore(response);
		}
		if (result.kind === "invalid") {
			return noStore(error(c, 401, "UNAUTHORIZED", "The browser login code is invalid or expired."));
		}
		const response = c.json(
			{ sessionId: result.session.id, expiresAt: new Date(result.session.expiresAt).toISOString() },
			201,
		);
		response.headers.append("set-cookie", browserSessionCookie(result.session.token, result.session.expiresAt));
		return noStore(response);
	});

	app.post("/logout", (c) => {
		if (!requireBrowserOrigin(c, origin)) {
			return error(c, 403, "FORBIDDEN", "This origin cannot end a Trellis browser session.");
		}
		const token = readBrowserSessionCookie(c.req.header("cookie"));
		if (token === null || options.sessions.authenticate(token) === null) {
			return noStore(error(c, 401, "UNAUTHORIZED", "The Trellis browser session is missing or expired."));
		}
		options.sessions.revokeToken(token);
		const response = c.body(null, 204);
		response.headers.append("set-cookie", expiredBrowserSessionCookie());
		return noStore(response);
	});

	return app;
};

export const browserSessionAdminRoutes = (options: BrowserSessionAdminRoutesOptions) => {
	if (options.hostToken.trim() === "") throw new Error("Browser sessions require a host token.");
	const app = new Hono();
	app.post("/code", hostAuth(options.hostToken), (c) => {
		const issued = options.sessions.issueCode();
		return noStore(c.json({ code: issued.code, expiresAt: new Date(issued.expiresAt).toISOString() }, 201));
	});
	app.delete("/:sessionId", hostAuth(options.hostToken), (c) => {
		options.sessions.revoke(c.req.param("sessionId"));
		return noStore(c.body(null, 204));
	});
	return app;
};
