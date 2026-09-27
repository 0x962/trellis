import type { Logger } from "../../../log.ts";
import type { BrowserSessionStore, IssuedBrowserLoginCode } from "../browserSessions.ts";
import { browserSessionSecurityEvent } from "./securityEvent.ts";

export type IssueBrowserSessionCodeInput = {
	reqId: string | null;
	sessions: BrowserSessionStore;
	log: Logger;
};

export const issueBrowserSessionCode = ({
	reqId,
	sessions,
	log,
}: IssueBrowserSessionCodeInput): IssuedBrowserLoginCode => {
	const issued = sessions.issueCode();
	browserSessionSecurityEvent({
		sessions,
		log,
		reqId,
		sessionId: null,
		action: "code.issue",
		result: "issued",
		codeId: issued.id,
	});
	return issued;
};
