import type { Logger } from "../../../log.ts";
import type { BrowserSessionStore } from "../browserSessions.ts";
import { browserSessionSecurityEvent } from "./securityEvent.ts";

export type RecordBrowserSessionRequestFailureInput = {
	reqId: string | null;
	result: "payload-too-large";
	sessions: BrowserSessionStore;
	log: Logger;
};

export const recordBrowserSessionRequestFailure = ({
	reqId,
	result,
	sessions,
	log,
}: RecordBrowserSessionRequestFailureInput): void => {
	browserSessionSecurityEvent({
		sessions,
		log,
		reqId,
		sessionId: null,
		action: "session.create",
		result,
	});
};
