import type { Logger } from "../../../../log.ts";
import type { BrowserSessionStore } from "../../browserSessions.ts";

export type LogBrowserSessionSecurityEventInput = {
	sessions: BrowserSessionStore;
	log: Logger;
	reqId: string | null;
	sessionId: string | null;
	action: string;
	result: string;
	codeId?: string;
};

export const logBrowserSessionSecurityEvent = ({
	sessions,
	log,
	reqId,
	sessionId,
	action,
	result,
	codeId,
}: LogBrowserSessionSecurityEventInput) =>
	log.info("browser session security", {
		hostId: sessions.hostId,
		reqId,
		sessionId,
		action,
		result,
		...(codeId === undefined ? {} : { codeId }),
	});
