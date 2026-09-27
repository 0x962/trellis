import type { WSContext, WSEvents } from "hono/ws";
import type {
	BrowserSession,
	BrowserSessionInvalidation,
	BrowserSessionStore,
} from "../../../services/browserSessions/index.ts";

export type BrowserSessionTerminalEventsOptions = {
	session: BrowserSession;
	sessions: Pick<BrowserSessionStore, "onInvalidated">;
	setup: () => Promise<WSEvents>;
};

const closeReason = (reason: BrowserSessionInvalidation) =>
	reason === "expired" ? "Browser session expired" : "Browser session revoked";

export const browserSessionTerminalEvents = async ({
	session,
	sessions,
	setup,
}: BrowserSessionTerminalEventsOptions): Promise<WSEvents> => {
	let socket: WSContext | null = null;
	let invalidated: BrowserSessionInvalidation | null = null;
	let removeInvalidation = () => {};
	removeInvalidation = sessions.onInvalidated(session.id, (reason) => {
		invalidated = reason;
		socket?.close(4401, closeReason(reason));
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
				ws.close(4401, closeReason(invalidated));
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
