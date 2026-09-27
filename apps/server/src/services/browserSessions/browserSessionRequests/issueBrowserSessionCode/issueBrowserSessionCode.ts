import type { Logger } from "../../../../log.ts";
import type { BrowserSessionStore, IssuedBrowserLoginCode } from "../../browserSessions.ts";
import { logBrowserSessionSecurityEvent } from "../logBrowserSessionSecurityEvent/index.ts";

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
	logBrowserSessionSecurityEvent({
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
