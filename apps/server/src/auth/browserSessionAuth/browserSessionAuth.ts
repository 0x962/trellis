import type { Context, MiddlewareHandler } from "hono";
import type { Logger } from "../../log.ts";
import {
	type BrowserSession,
	type BrowserSessionStore,
	readBrowserSessionCookie,
} from "../../services/browserSessions/index.ts";
import { hostAuth } from "../auth.ts";

export type BrowserSessionAuthOptions = {
	origin: string;
	sessions: BrowserSessionStore;
	log: Logger;
};

const requestSessions = new WeakMap<Request, BrowserSession>();

const unauthorized = (c: Context) => {
	c.header("www-authenticate", 'Bearer realm="Trellis", TrellisSession realm="Trellis"');
	return c.json(
		{
			defined: false,
			code: "UNAUTHORIZED",
			status: 401,
			message: "The Trellis browser session is missing or expired.",
		},
		401,
	);
};

const forbidden = (c: Context) =>
	c.json(
		{
			defined: false,
			code: "FORBIDDEN",
			status: 403,
			message: "This origin cannot use the Trellis browser session.",
		},
		403,
	);

export const requestHasBrowserOrigin = (c: Context, origin: string) => c.req.header("origin") === origin;

export const browserSessionForRequest = (request: Request) => requestSessions.get(request) ?? null;

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
	const bearerAuth = hostAuth(hostToken);
	const authentication = (c: Context, sessionId: string | null, result: string) =>
		options.log.info("browser session security", {
			hostId: options.sessions.hostId,
			reqId: c.get("requestId") ?? null,
			sessionId,
			action: "session.authenticate",
			result,
		});
	return async (c, next) => {
		if (c.req.header("authorization") !== undefined) {
			const response = await bearerAuth(c, next);
			authentication(c, null, response === undefined ? "bearer-accepted" : "bearer-rejected");
			return response;
		}
		const token = readBrowserSessionCookie(c.req.header("cookie"));
		if (token === null) {
			authentication(c, null, "cookie-missing");
			return unauthorized(c);
		}
		const session = options.sessions.authenticate(token);
		if (session === null) {
			authentication(c, null, "cookie-rejected");
			return unauthorized(c);
		}
		const websocket = c.req.header("upgrade")?.toLowerCase() === "websocket";
		const mutation = !["GET", "HEAD", "OPTIONS"].includes(c.req.method);
		if ((websocket || mutation) && !requestHasBrowserOrigin(c, origin)) {
			authentication(c, session.id, "origin-rejected");
			return forbidden(c);
		}
		requestSessions.set(c.req.raw, session);
		authentication(c, session.id, "cookie-accepted");
		await next();
	};
};
