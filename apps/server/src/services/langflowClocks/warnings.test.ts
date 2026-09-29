import { afterEach, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import {
	listPendingWarnings,
	readProjectionFacts,
	recordLaunch,
	reserveNative,
} from "../../db/queries/langflowExecution";
import { ids, now } from "../../db/queries/langflowExecution/fixtures/fixture";
import { handle } from "../../db/queries/langflowExecution/fixtures/native";
import { cancelExecution } from "../langflowStops/cancelExecution";
import { stopFixture } from "../langflowTestFixture";
import { recordLaunchClocks } from "./recordLaunchClocks";
import { sendWarnings } from "./sendWarnings";

let fixture: Awaited<ReturnType<typeof stopFixture>>;
afterEach(async () => {
	await fixture.db.$client.close();
});
const input = { executionId: ids.execution };
const status = (receipts: string[]): RuntimeProcessStatus => ({
	id: handle.attemptId,
	daemonId: "runtime-1",
	pid: 12,
	mode: "pty",
	status: "running",
	startedAt: now.toISOString(),
	endedAt: null,
	exitCode: null,
	error: null,
	elapsedMs: 60_000,
	agent: null,
	result: null,
	acknowledgedMessageIds: receipts,
	activity: null,
	checkedAt: new Date(now.getTime() + 60_000).toISOString(),
	controllable: true,
	process: null,
	launch: null,
});

test("the first prompt receipt gates the durable warning", async () => {
	fixture = await stopFixture(true);
	const clock = { ...fixture.io, now: () => new Date(now.getTime() + 60_000) };
	await sendWarnings(clock, input, {
		status: async () => status([]),
		sendAtTurnBoundary: async () => {
			throw new Error("warning before prompt receipt");
		},
	});
	expect(await fixture.run((tx) => listPendingWarnings(tx, { ...input, afterId: "", limit: 10 }))).toEqual([]);
});

test("a lost warning acknowledgement preserves the message identity and bytes", async () => {
	fixture = await stopFixture(true);
	const clock = { ...fixture.io, now: () => new Date(now.getTime() + 60_000) };
	const writes = new Map<string, string>();
	const receipts = [handle.attemptId];
	const host = {
		status: async () => status(receipts),
		sendAtTurnBoundary: async (_attempt: string, text: string, messageId: string) => {
			if (writes.has(messageId)) expect(writes.get(messageId)).toBe(text);
			writes.set(messageId, text);
			return status(receipts);
		},
	};
	await sendWarnings(clock, input, host);
	await sendWarnings({ ...clock }, input, host);
	expect(writes.size).toBe(1);
	const pending = await fixture.run((tx) => listPendingWarnings(tx, { ...input, afterId: "", limit: 10 }));
	expect(pending).toHaveLength(1);
	receipts.push(pending[0]!.messageId);
	await sendWarnings(clock, input, host);
	expect(await fixture.run((tx) => listPendingWarnings(tx, { ...input, afterId: "", limit: 10 }))).toEqual([]);
});

test("cancellation blocks warnings even when a prompt receipt exists", async () => {
	fixture = await stopFixture(true);
	await fixture.run((tx) => cancelExecution(fixture.core, tx, { id: input.executionId, expectedRevision: 1 }));
	await sendWarnings({ ...fixture.io, now: () => new Date(now.getTime() + 60_000) }, input, {
		status: async () => status([handle.attemptId]),
		sendAtTurnBoundary: async () => {
			throw new Error("warning after cancel");
		},
	});
});

test("a repeated launch observation preserves the stored deadline", async () => {
	fixture = await stopFixture(true);
	const before = await fixture.run((tx) => readProjectionFacts(tx, input));
	await fixture.run((tx) =>
		recordLaunchClocks({ ...fixture.core, now: new Date(now.getTime() + 600_000) }, tx, {
			...input,
			stepId: handle.stepId,
		}),
	);
	const after = await fixture.run((tx) => readProjectionFacts(tx, input));
	expect(after.deadlines).toEqual(before.deadlines);
	expect(after.deadlines[0]!.deadlineAt).toBe(new Date(now.getTime() + 120_000).toISOString());
});

const secondHandle = { ...handle, stepId: "step-2", attemptId: "00000000-0000-4000-8000-000000000009" };
async function addLaunchedAttempt() {
	await fixture.run(async (tx) => {
		await reserveNative(tx, {
			requestBytes: JSON.stringify({
				...fixture.request,
				requestId: crypto.randomUUID(),
				nodeId: "next",
				occurrenceKey: "next",
			}),
			taskKey: "next",
			handle: secondHandle,
			authority: fixture.authority,
			now,
		});
		await recordLaunch(tx, {
			...input,
			receipt: {
				version: 1,
				launchReceiptId: "launch-2",
				stepId: secondHandle.stepId,
				attemptId: secondHandle.attemptId,
				launchedAt: now.toISOString(),
				recordedAt: now.toISOString(),
				groupDeadlines: [],
			},
		});
	});
}

test("a reserved attempt needs no runtime status before launch", async () => {
	fixture = await stopFixture();
	let reads = 0;
	await sendWarnings(fixture.io, input, {
		status: async () => {
			reads++;
			throw new Error("SESSION_NOT_FOUND");
		},
		sendAtTurnBoundary: async () => {
			throw new Error("unlaunched warning");
		},
	});
	expect(reads).toBe(0);
});

test.each(["status", "delivery"])("an unknown %s for one attempt does not block another warning", async (failure) => {
	fixture = await stopFixture(true);
	await addLaunchedAttempt();
	const delivered: string[] = [];
	const errors: unknown[] = [];
	await sendWarnings(
		{
			...fixture.io,
			now: () => new Date(now.getTime() + 60_000),
			log: (_message, fields) => {
				errors.push(fields);
			},
		},
		input,
		{
			status: async (attemptId) => {
				if (failure === "status" && attemptId === handle.attemptId) throw new Error("SESSION_NOT_FOUND");
				return { ...status([attemptId]), id: attemptId };
			},
			sendAtTurnBoundary: async (attemptId, _text, messageId) => {
				if (attemptId === handle.attemptId) throw new Error("HARNESS_DELIVERY_UNKNOWN");
				delivered.push(attemptId);
				return { ...status([attemptId, messageId!]), id: attemptId };
			},
		},
	);
	expect(delivered).toEqual([secondHandle.attemptId]);
	expect(errors).toHaveLength(1);
	const pending = await fixture.run((tx) => listPendingWarnings(tx, { ...input, afterId: "", limit: 10 }));
	expect(pending.map((warning) => warning.attemptId)).toEqual(failure === "delivery" ? [handle.attemptId] : []);
});
