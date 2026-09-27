import type { Logger } from "../../../../log.ts";
import type { BrowserSessionStore } from "../../browserSessions.ts";
import { logBrowserSessionSecurityEvent } from "../logBrowserSessionSecurityEvent/index.ts";

export type RecordOversizedBrowserSessionRequestInput = {
	reqId: string | null;
	sessions: BrowserSessionStore;
	log: Logger;
};

export const recordOversizedBrowserSessionRequest = ({
	reqId,
	sessions,
	log,
}: RecordOversizedBrowserSessionRequestInput): void => {
	logBrowserSessionSecurityEvent({
		sessions,
		log,
		reqId,
		sessionId: null,
		action: "session.create",
		result: "payload-too-large",
	});
};
