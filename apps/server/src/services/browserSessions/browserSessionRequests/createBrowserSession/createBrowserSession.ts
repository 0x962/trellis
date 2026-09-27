import type { Logger } from "../../../../log.ts";
import type { BrowserSessionStore, RedeemedBrowserSession } from "../../browserSessions.ts";
import { logBrowserSessionSecurityEvent } from "../logBrowserSessionSecurityEvent/index.ts";

export type CreateBrowserSessionInput = {
	origin: string | undefined;
	expectedOrigin: string;
	code: string | null;
	reqId: string | null;
	sessions: BrowserSessionStore;
	log: Logger;
};

export type CreateBrowserSessionResult =
	| { kind: "created"; session: RedeemedBrowserSession }
	| { kind: "bad-request" }
	| { kind: "forbidden" }
	| { kind: "invalid" }
	| { kind: "rate-limited"; retryAt: number };

export const createBrowserSession = ({
	origin,
	expectedOrigin,
	code,
	reqId,
	sessions,
	log,
}: CreateBrowserSessionInput): CreateBrowserSessionResult => {
	if (origin !== expectedOrigin) {
		logBrowserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "session.create",
			result: "origin-rejected",
		});
		return { kind: "forbidden" };
	}
	if (code === null) {
		logBrowserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "session.create",
			result: "bad-request",
		});
		return { kind: "bad-request" };
	}
	const login = sessions.redeemCode(code);
	if (login.kind === "rate-limited") {
		logBrowserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "code.redeem",
			result: "rate-limited",
		});
		return login;
	}
	if (login.kind === "invalid") {
		logBrowserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "code.redeem",
			result: "rejected",
		});
		return login;
	}
	logBrowserSessionSecurityEvent({
		sessions,
		log,
		reqId,
		sessionId: login.session.id,
		action: "code.redeem",
		result: "redeemed",
		codeId: login.codeId,
	});
	return { kind: "created", session: login.session };
};
