import type { WSContext, WSEvents } from "hono/ws";
import type { Logger } from "../../../log.ts";
import type {
	BrowserSession,
	BrowserSessionInvalidation,
	BrowserSessionStore,
} from "../../../services/browserSessions/index.ts";

export type BrowserSessionTerminalEventsOptions = {
	session: BrowserSession;
	sessions: Pick<BrowserSessionStore, "onInvalidated">;
	log: Pick<Logger, "info">;
	reqId: string;
	runId: string;
	attemptId: string;
	setup: () => Promise<WSEvents>;
};

const closeReason = (reason: BrowserSessionInvalidation) =>
	reason === "expired" ? "Browser session expired" : "Browser session revoked";

export const browserSessionTerminalEvents = async ({
	session,
	sessions,
	log,
	reqId,
	runId,
	attemptId,
	setup,
}: BrowserSessionTerminalEventsOptions): Promise<WSEvents> => {
	let socket: WSContext | null = null;
	let invalidated: BrowserSessionInvalidation | null = null;
	const close = (target: WSContext, reason: BrowserSessionInvalidation) => {
		log.info("browser terminal session closed", {
			reqId,
			sessionId: session.id,
			runId,
			attemptId,
			reason,
		});
		target.close(4401, closeReason(reason));
	};
	let removeInvalidation = () => {};
	removeInvalidation = sessions.onInvalidated(session.id, (reason) => {
		invalidated = reason;
		if (socket !== null) close(socket, reason);
	});

	let events: WSEvents;
	try {
		events = await setup();
	} catch (error) {
		removeInvalidation();
		throw error;
	}

	return {
		...events,
		onOpen: (event, ws) => {
			socket = ws;
			if (invalidated !== null) {
				close(ws, invalidated);
				return;
			}
			events.onOpen?.(event, ws);
		},
		onClose: (event, ws) => {
			removeInvalidation();
			events.onClose?.(event, ws);
		},
		onError: (event, ws) => {
			removeInvalidation();
			events.onError?.(event, ws);
		},
	};
};
