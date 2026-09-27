import { timingSafeEqual } from "node:crypto";
import type { Logger } from "../../../log.ts";
import type { BrowserSession, BrowserSessionStore } from "../browserSessions.ts";
import { browserSessionSecurityEvent } from "./securityEvent.ts";

export type AuthenticateBrowserRequestInput = {
	authorization: string | undefined;
	origin: string | undefined;
	expectedOrigin: string;
	requestUrl: string;
	method: string;
	websocket: boolean;
	token: string | null;
	hostToken: string;
	reqId: string | null;
	sessions: BrowserSessionStore;
	log: Logger;
};

export type AuthenticateBrowserRequestResult =
	| { kind: "accepted"; session: BrowserSession | null }
	| { kind: "forbidden"; credential: "bearer" | "session" }
	| { kind: "unauthorized"; credential: "bearer" | "session" };

const matchesHostToken = (authorization: string, hostToken: string) => {
	const actual = Buffer.from(authorization);
	const expected = Buffer.from(`Bearer ${hostToken}`);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const authenticateBrowserRequest = ({
	authorization,
	origin,
	expectedOrigin,
	requestUrl,
	method,
	websocket,
	token,
	hostToken,
	reqId,
	sessions,
	log,
}: AuthenticateBrowserRequestInput): AuthenticateBrowserRequestResult => {
	if (authorization !== undefined) {
		if (!matchesHostToken(authorization, hostToken)) {
			browserSessionSecurityEvent({
				sessions,
				log,
				reqId,
				sessionId: null,
				action: "session.authenticate",
				result: "bearer-rejected",
			});
			return { kind: "unauthorized", credential: "bearer" };
		}
		if (origin !== undefined && origin !== new URL(requestUrl).origin) {
			browserSessionSecurityEvent({
				sessions,
				log,
				reqId,
				sessionId: null,
				action: "session.authenticate",
				result: "origin-rejected",
			});
			return { kind: "forbidden", credential: "bearer" };
		}
		browserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "session.authenticate",
			result: "bearer-accepted",
		});
		return { kind: "accepted", session: null };
	}
	if (token === null) {
		browserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "session.authenticate",
			result: "cookie-missing",
		});
		return { kind: "unauthorized", credential: "session" };
	}
	const session = sessions.authenticate(token);
	if (session === null) {
		browserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "session.authenticate",
			result: "cookie-rejected",
		});
		return { kind: "unauthorized", credential: "session" };
	}
	const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
	if ((websocket || mutation) && origin !== expectedOrigin) {
		browserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: session.id,
			action: "session.authenticate",
			result: "origin-rejected",
		});
		return { kind: "forbidden", credential: "session" };
	}
	browserSessionSecurityEvent({
		sessions,
		log,
		reqId,
		sessionId: session.id,
		action: "session.authenticate",
		result: "cookie-accepted",
	});
	return { kind: "accepted", session };
};
