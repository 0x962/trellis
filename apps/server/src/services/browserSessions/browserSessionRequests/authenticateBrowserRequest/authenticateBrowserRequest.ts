import type { Logger } from "../../../../log.ts";
import type { BrowserSession, BrowserSessionStore } from "../../browserSessions.ts";
import { logBrowserSessionSecurityEvent } from "../logBrowserSessionSecurityEvent/index.ts";

export type AuthenticateBrowserRequestInput = {
	origin: string | undefined;
	expectedOrigin: string;
	method: string;
	websocket: boolean;
	token: string | null;
	reqId: string | null;
	sessions: BrowserSessionStore;
	log: Logger;
};

export type AuthenticateBrowserRequestResult =
	| { kind: "accepted"; session: BrowserSession }
	| { kind: "forbidden" }
	| { kind: "unauthorized" };

export const authenticateBrowserRequest = ({
	origin,
	expectedOrigin,
	method,
	websocket,
	token,
	reqId,
	sessions,
	log,
}: AuthenticateBrowserRequestInput): AuthenticateBrowserRequestResult => {
	if (token === null) {
		logBrowserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "session.authenticate",
			result: "cookie-missing",
		});
		return { kind: "unauthorized" };
	}
	const session = sessions.authenticate(token);
	if (session === null) {
		logBrowserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "session.authenticate",
			result: "cookie-rejected",
		});
		return { kind: "unauthorized" };
	}
	const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
	if ((websocket || mutation) && origin !== expectedOrigin) {
		logBrowserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: session.id,
			action: "session.authenticate",
			result: "origin-rejected",
		});
		return { kind: "forbidden" };
	}
	logBrowserSessionSecurityEvent({
		sessions,
		log,
		reqId,
		sessionId: session.id,
		action: "session.authenticate",
		result: "cookie-accepted",
	});
	return { kind: "accepted", session };
};
