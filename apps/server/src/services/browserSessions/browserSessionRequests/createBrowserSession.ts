import type { Logger } from "../../../log.ts";
import type { BrowserSessionStore, RedeemedBrowserSession } from "../browserSessions.ts";
import { browserSessionSecurityEvent } from "./securityEvent.ts";

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
		browserSessionSecurityEvent({
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
		browserSessionSecurityEvent({
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
		browserSessionSecurityEvent({
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
		browserSessionSecurityEvent({
			sessions,
			log,
			reqId,
			sessionId: null,
			action: "code.redeem",
			result: "rejected",
		});
		return login;
	}
	browserSessionSecurityEvent({
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
