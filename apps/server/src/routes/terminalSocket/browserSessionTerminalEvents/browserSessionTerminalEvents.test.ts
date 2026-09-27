import { expect, test } from "bun:test";
import type { WSContext, WSEvents } from "hono/ws";
import type { Fields, Logger } from "../../../log.ts";
import type { BrowserSessionInvalidation } from "../../../services/browserSessions/index.ts";
import { browserSessionTerminalEvents } from "./browserSessionTerminalEvents.ts";

const session = { id: "session-id", expiresAt: Date.now() + 60_000 };
const eventsOptions = (records: Fields[] = []) => ({
	log: { info: (_message: string, fields?: Fields) => records.push(fields ?? {}) } as unknown as Logger,
	reqId: "request-id",
	runId: "run-id",
	attemptId: "attempt-id",
});

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
		...eventsOptions(),
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
	const events = await browserSessionTerminalEvents({
		session,
		sessions: source.sessions,
		...eventsOptions(),
		setup: async () => ({}),
	});
	const opened = socket();
	events.onOpen?.(new Event("open"), opened.ws);
	source.invalidate("revoked");
	expect(opened.closes).toEqual([[4401, "Browser session revoked"]]);
});

test("removes the invalidation listener on close and error", async () => {
	const source = harness();
	const events = await browserSessionTerminalEvents({
		session,
		sessions: source.sessions,
		...eventsOptions(),
		setup: async () => ({}),
	});
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
			...eventsOptions(),
			setup: async () => {
				throw failure;
			},
		}),
	).rejects.toBe(failure);
	expect(source.removed()).toBe(1);
});

test("logs the socket identity before a session closes it", async () => {
	const source = harness();
	const records: Fields[] = [];
	const events = await browserSessionTerminalEvents({
		session,
		sessions: source.sessions,
		...eventsOptions(records),
		setup: async () => ({}),
	});
	const opened = socket();
	events.onOpen?.(new Event("open"), opened.ws);
	source.invalidate("revoked");
	expect(records).toEqual([
		{
			reqId: "request-id",
			sessionId: "session-id",
			runId: "run-id",
			attemptId: "attempt-id",
			reason: "revoked",
		},
	]);
});
