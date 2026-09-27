import { expect, test } from "bun:test";
import type { WSContext, WSEvents } from "hono/ws";
import type { BrowserSessionInvalidation } from "../../../services/browserSessions/index.ts";
import { browserSessionTerminalEvents } from "./browserSessionTerminalEvents.ts";

const session = { id: "session-id", expiresAt: Date.now() + 60_000 };

const harness = () => {
	let listener: ((reason: BrowserSessionInvalidation) => void) | null = null;
	let removed = 0;
	return {
		sessions: {
			onInvalidated: (_id: string, next: (reason: BrowserSessionInvalidation) => void) => {
				listener = next;
				return () => {
					removed += 1;
				};
			},
		},
		invalidate: (reason: BrowserSessionInvalidation) => listener?.(reason),
		removed: () => removed,
	};
};

const socket = () => {
	const closes: Array<[number, string]> = [];
	return {
		ws: { close: (code: number, reason: string) => closes.push([code, reason]) } as unknown as WSContext,
		closes,
	};
};

test("closes after invalidation wins the setup race", async () => {
	const source = harness();
	let finishSetup: ((events: WSEvents) => void) | undefined;
	const pending = browserSessionTerminalEvents({
		session,
		sessions: source.sessions,
		setup: () => new Promise<WSEvents>((resolve) => (finishSetup = resolve)),
	});
	source.invalidate("expired");
	finishSetup?.({});
	const events = await pending;
	const opened = socket();
	events.onOpen?.(new Event("open"), opened.ws);
	expect(opened.closes).toEqual([[4401, "Browser session expired"]]);
});

test("closes an open socket when its session is revoked", async () => {
	const source = harness();
	const events = await browserSessionTerminalEvents({ session, sessions: source.sessions, setup: async () => ({}) });
	const opened = socket();
	events.onOpen?.(new Event("open"), opened.ws);
	source.invalidate("revoked");
	expect(opened.closes).toEqual([[4401, "Browser session revoked"]]);
});

test("removes the invalidation listener on close and error", async () => {
	const source = harness();
	const events = await browserSessionTerminalEvents({ session, sessions: source.sessions, setup: async () => ({}) });
	const opened = socket();
	events.onClose?.(new CloseEvent("close"), opened.ws);
	events.onError?.(new Event("error"), opened.ws);
	expect(source.removed()).toBe(2);
});

test("removes the invalidation listener when terminal setup fails", async () => {
	const source = harness();
	const failure = new Error("terminal setup failed");
	await expect(
		browserSessionTerminalEvents({
			session,
			sessions: source.sessions,
			setup: async () => {
				throw failure;
			},
		}),
	).rejects.toBe(failure);
	expect(source.removed()).toBe(1);
});
