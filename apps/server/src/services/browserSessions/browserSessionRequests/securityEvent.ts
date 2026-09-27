import type { Logger } from "../../../log.ts";
import type { BrowserSessionStore } from "../browserSessions.ts";

export type BrowserSessionSecurityEventOptions = {
	sessions: BrowserSessionStore;
	log: Logger;
	reqId: string | null;
	sessionId: string | null;
	action: string;
	result: string;
	codeId?: string;
};

export const browserSessionSecurityEvent = ({
	sessions,
	log,
	reqId,
	sessionId,
	action,
	result,
	codeId,
}: BrowserSessionSecurityEventOptions) =>
	log.info("browser session security", {
		hostId: sessions.hostId,
		reqId,
		sessionId,
		action,
		result,
		...(codeId === undefined ? {} : { codeId }),
	});
