import type { Context, MiddlewareHandler } from "hono";
import type { Logger } from "../../log.ts";
import {
	authenticateBrowserRequest,
	type BrowserSession,
	type BrowserSessionStore,
	logBrowserSessionSecurityEvent,
	readBrowserSessionCookie,
} from "../../services/browserSessions/index.ts";
import { hostAuth } from "../auth.ts";

declare module "hono" {
	interface ContextVariableMap {
		browserSession: BrowserSession | undefined;
	}
}

export type BrowserSessionAuthOptions = {
	origin: string;
	sessions: BrowserSessionStore;
	log: Logger;
};

const unauthorized = (c: Context, credential: "bearer" | "session") => {
	c.header(
		"www-authenticate",
		credential === "bearer" ? 'Bearer realm="Trellis"' : 'Bearer realm="Trellis", TrellisSession realm="Trellis"',
	);
	return c.json(
		{
			defined: false,
			code: "UNAUTHORIZED",
			status: 401,
			message:
				credential === "bearer"
					? "The Trellis host token is missing or incorrect."
					: "The Trellis browser session is missing or expired.",
		},
		401,
	);
};

const forbidden = (c: Context, credential: "bearer" | "session") =>
	c.json(
		{
			defined: false,
			code: "FORBIDDEN",
			status: 403,
			message:
				credential === "bearer"
					? "This origin cannot access the Trellis host."
					: "This origin cannot use the Trellis browser session.",
		},
		403,
	);

export const browserSessionFromContext = (context: Context) => context.get("browserSession") ?? null;

export const browserSessionOrigin = (value: string) => {
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.username !== "" ||
		url.password !== "" ||
		url.pathname !== "/" ||
		url.search !== "" ||
		url.hash !== ""
	) {
		throw new Error("The browser session origin must be an HTTPS origin.");
	}
	return url.origin;
};

export const browserSessionAuth = (
	hostToken: string | null,
	options: BrowserSessionAuthOptions | null,
): MiddlewareHandler => {
	if (options === null) return hostAuth(hostToken);
	if (hostToken === null || hostToken.trim() === "") throw new Error("Browser sessions require a host token.");
	const origin = browserSessionOrigin(options.origin);
	const authenticateBearer = hostAuth(hostToken);
	return async (c, next) => {
		if (c.req.header("authorization") !== undefined) {
			let accepted = false;
			const response = await authenticateBearer(c, async () => {
				accepted = true;
				await next();
			});
			logBrowserSessionSecurityEvent({
				sessions: options.sessions,
				log: options.log,
				reqId: c.get("requestId") ?? null,
				sessionId: null,
				action: "session.authenticate",
				result: accepted ? "bearer-accepted" : response?.status === 403 ? "origin-rejected" : "bearer-rejected",
			});
			return response;
		}
		const result = authenticateBrowserRequest({
			origin: c.req.header("origin"),
			expectedOrigin: origin,
			method: c.req.method,
			websocket: c.req.header("upgrade")?.toLowerCase() === "websocket",
			token: readBrowserSessionCookie(c.req.header("cookie")),
			reqId: c.get("requestId") ?? null,
			sessions: options.sessions,
			log: options.log,
		});
		if (result.kind === "unauthorized") return unauthorized(c, "session");
		if (result.kind === "forbidden") return forbidden(c, "session");
		c.set("browserSession", result.session);
		await next();
	};
};
