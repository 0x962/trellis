import type { Logger } from "../../../log.ts";
import type { BrowserSessionStore } from "../browserSessions.ts";
import { browserSessionSecurityEvent } from "./securityEvent.ts";

export type RevokeBrowserSessionInput = {
	sessionId: string;
	reqId: string | null;
	sessions: BrowserSessionStore;
	log: Logger;
};

export const revokeBrowserSession = ({
	sessionId,
	reqId,
	sessions,
	log,
}: RevokeBrowserSessionInput): void => {
	const revoked = sessions.revoke(sessionId);
	browserSessionSecurityEvent({
		sessions,
		log,
		reqId,
		sessionId,
		action: "session.revoke",
		result: revoked ? "revoked" : "not-found",
	});
};
