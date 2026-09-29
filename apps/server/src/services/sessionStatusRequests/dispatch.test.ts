import { expect, test } from "bun:test";
import type { SessionUpdateRequest } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { IoCtx } from "../support.ts";
import { prepareSessionStatusRequests, type SessionStatusRequestDeps } from "./dispatch.ts";

const now = new Date("2026-09-29T12:05:00.000Z");
const candidate = { sessionId: "01M3NTSP1HRSKKKW47PYJECRXB", runId: "run", terminalId: "attempt" };
const process = (overrides: Partial<RuntimeProcessStatus> = {}): RuntimeProcessStatus => ({
	id: "attempt",
	daemonId: "runtime",
	pid: 1,
	mode: "pty",
	status: "running",
	startedAt: "2026-09-29T12:00:00.000Z",
	endedAt: null,
	exitCode: null,
	error: null,
	elapsedMs: 300_000,
	agent: null,
	acknowledgedMessageIds: [],
	activity: {
		state: "working",
		updatedAt: "2026-09-29T12:00:00.000Z",
		workingSince: "2026-09-29T12:00:00.000Z",
	},
	checkedAt: now.toISOString(),
	controllable: true,
	process: null,
	launch: null,
	result: null,
	...overrides,
});

const request = (
	state: SessionUpdateRequest["state"],
	overrides: Partial<SessionUpdateRequest> = {},
): SessionUpdateRequest => ({
	requestId: "cd29f82f-a817-4b2e-a1cf-1f799236553a",
	requestedAt: "2026-09-29T12:00:00.000Z",
	state,
	error: null,
	...overrides,
});

const fixture = (input: {
	current?: SessionUpdateRequest | null;
	process?: RuntimeProcessStatus;
	sendError?: Error;
}) => {
	let current = input.current ?? null;
	const sent: Array<{ requestId: string; text: string }> = [];
	const states: SessionUpdateRequest[] = [];
	let begins = 0;
	const deps: SessionStatusRequestDeps = {
		candidates: async () => [candidate],
		runtime: async () => [input.process ?? process()],
		requests: async () => new Map([[candidate.sessionId, current]]),
		beginRequest: async (_ctx, _sessionId, requestId) => {
			begins++;
			current = request("pending", { requestId, requestedAt: now.toISOString() });
			return current;
		},
		setRequest: async (_ctx, update) => {
			current = request(update.state, {
				requestId: update.requestId,
				requestedAt: current!.requestedAt,
				error: update.error ?? null,
			});
			states.push(current);
			return current;
		},
		send: async (_ctx, delivery) => {
			sent.push(delivery);
			if (input.sendError) throw input.sendError;
		},
		requestId: () => "fc549cba-8bd3-427c-bee5-668a6d4cc357",
	};
	const ctx = { now: () => now } as IoCtx;
	return {
		run: () => prepareSessionStatusRequests(ctx, {}, deps),
		stats: () => ({ begins, sent, states }),
	};
};

test("requests status after five minutes of continuous work", async () => {
	const before = fixture({
		process: process({
			activity: {
				state: "working",
				updatedAt: "2026-09-29T12:00:01.000Z",
				workingSince: "2026-09-29T12:00:01.000Z",
			},
		}),
	});
	await before.run();
	expect(before.stats()).toMatchObject({ begins: 0, sent: [] });

	const due = fixture({});
	await due.run();
	expect(due.stats().begins).toBe(1);
	expect(due.stats().sent[0]).toMatchObject({ requestId: "fc549cba-8bd3-427c-bee5-668a6d4cc357" });
	expect(due.stats().sent[0]!.text).toContain(
		"trellis session status write 01M3NTSP1HRSKKKW47PYJECRXB --request-id fc549cba-8bd3-427c-bee5-668a6d4cc357 --body -",
	);
	expect(due.stats().states.at(-1)?.state).toBe("sent");
});

test("retries one pending request after restart without another request", async () => {
	const pending = fixture({ current: request("pending") });
	await pending.run();
	expect(pending.stats().begins).toBe(0);
	expect(pending.stats().sent[0]?.requestId).toBe("cd29f82f-a817-4b2e-a1cf-1f799236553a");
	expect(pending.stats().states.at(-1)?.state).toBe("sent");
});

test("finishes a pending restart request after the agent receives it", async () => {
	const pending = fixture({
		current: request("pending"),
		process: process({ acknowledgedMessageIds: ["cd29f82f-a817-4b2e-a1cf-1f799236553a"] }),
	});
	await pending.run();
	expect(pending.stats()).toMatchObject({ begins: 0, sent: [] });
	expect(pending.stats().states.at(-1)?.state).toBe("sent");
});

test("keeps one sent request outstanding while its reply is delayed", async () => {
	const sent = fixture({ current: request("sent") });
	await sent.run();
	expect(sent.stats()).toMatchObject({ begins: 0, sent: [], states: [] });
});

test("fails a sent request when its turn ends without a saved reply", async () => {
	const sent = fixture({
		current: request("sent"),
		process: process({
			acknowledgedMessageIds: ["cd29f82f-a817-4b2e-a1cf-1f799236553a"],
			activity: { state: "idle", updatedAt: now.toISOString() },
		}),
	});
	await sent.run();
	expect(sent.stats().states.at(-1)).toMatchObject({
		state: "failed",
		error: "The agent finished the status request without saving an update.",
	});
});

test("records a transport failure without a replacement reply", async () => {
	const failed = fixture({ sendError: new Error("The provider side channel is unavailable.") });
	await failed.run();
	expect(failed.stats().states.at(-1)).toMatchObject({
		state: "failed",
		error: "The provider side channel is unavailable.",
	});
});

test("keeps a pending request when an earlier delivery is unconfirmed", async () => {
	const unconfirmed = fixture({
		current: request("pending"),
		sendError: Object.assign(new Error("Delivery is unconfirmed."), { code: "HARNESS_DELIVERY_UNKNOWN" }),
	});
	await unconfirmed.run();
	expect(unconfirmed.stats()).toMatchObject({ begins: 0, states: [] });
});

test("does not ask an idle process for a new status update", async () => {
	const idle = fixture({
		process: process({ activity: { state: "idle", updatedAt: now.toISOString() } }),
	});
	await idle.run();
	expect(idle.stats()).toMatchObject({ begins: 0, sent: [], states: [] });
});

test("fails a pending request when the process pauses before delivery", async () => {
	const paused = fixture({
		current: request("pending"),
		process: process({ status: "exited", endedAt: now.toISOString(), pid: null }),
	});
	await paused.run();
	expect(paused.stats().states.at(-1)).toMatchObject({
		state: "failed",
		error: "The agent stopped before Trellis sent the status request.",
	});
});
