import type { Logger } from "../../../../log.ts";
import type { BrowserSessionStore } from "../../browserSessions.ts";
import { logoutBrowserSession } from "../../logoutBrowserSession/index.ts";
import { logBrowserSessionSecurityEvent } from "../logBrowserSessionSecurityEvent/index.ts";

export type EndBrowserSessionInput = {
	origin: string | undefined;
	expectedOrigin: string;
	token: string | null;
	reqId: string | null;
	sessions: BrowserSessionStore;
	log: Logger;
};

export type EndBrowserSessionResult =
	| { kind: "ended" }
	| { kind: "forbidden" }
	| { kind: "unauthorized" };

export const endBrowserSession = ({
	origin,
	expectedOrigin,
	token,
	reqId,
	sessions,
	log,
}: EndBrowserSessionInput): EndBrowserSessionResult => {
	if (origin !== expectedOrigin) {
		logBrowserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "session.logout",
			result: "origin-rejected",
		});
		return { kind: "forbidden" };
	}
	const logout = logoutBrowserSession(sessions, token);
	if (logout.kind === "unauthorized") {
		logBrowserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "session.logout",
			result: "unauthorized",
		});
		return logout;
	}
	logBrowserSessionSecurityEvent({
		sessions,
		log,
		reqId,
		sessionId: logout.sessionId,
		action: "session.logout",
		result: "logged-out",
	});
	return { kind: "ended" };
};
