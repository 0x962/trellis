import { expect, test } from "bun:test";
import type { IoCtx } from "../support.ts";
import { prepareSessionObserverGenerations, recoverSessionObserverGeneration } from "./index.ts";
import { activity, fixture, message, observerId, runId } from "./testFixture";

test("saves one update through the exact activity cursor", async () => {
	const { calls, deps } = fixture({});
	const result = await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
	expect(result).toEqual({ checked: 1, saved: 1, failed: 0 });
	expect(calls.claim).toEqual([{ runId, throughCursor: "cursor-2" }]);
	expect(calls.save[0]).toMatchObject({ throughCursor: "cursor-2", update: { body: "The project account." } });
	expect(calls.generate[0]).toMatchObject({ throughCursor: "cursor-2", deliveryId: "narrative" });
});

test("idle time alone makes no Claude call", async () => {
	const { calls, deps } = fixture({ items: activity.slice(0, 19) });
	const result = await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
	expect(result).toEqual({ checked: 1, saved: 0, failed: 0 });
	expect(calls.claim).toEqual([]);
	expect(calls.generate).toEqual([]);
});

test("completion and a request for human input bypass the count", async () => {
	for (const signal of [{ completed: true }, { needsInput: true }]) {
		const { calls, deps } = fixture({ ...signal, items: [] });
		await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
		expect(calls.generate).toHaveLength(1);
	}
});

test("initial generation works when activity is unavailable", async () => {
	const { calls, deps } = fixture({ hasObserverMessages: false, items: [], unavailable: true });
	await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
	expect(calls.generate).toHaveLength(1);
	expect((calls.generate[0] as { userContext: string }).userContext).toContain("Some message coverage is unavailable.");
});

test("20 completed tools reach the threshold when message coverage is unavailable", async () => {
	const { calls, deps } = fixture({ unavailable: true });
	await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
	const prompt = (calls.generate[0] as { userContext: string }).userContext;
	expect(prompt).toContain("Trigger: threshold");
	expect(prompt).toContain("Some message coverage is unavailable.");
});

test("completed tools, urgent signals, and uncertain context stay separate", async () => {
	const { calls, deps } = fixture({
		unavailable: true,
		completed: true,
		needsInput: true,
		context: [{ kind: "message", role: "assistant", body: "An unproven complete assistant message." }],
	});
	await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
	const prompt = (calls.generate[0] as { userContext: string }).userContext;
	expect(prompt).toContain("Trigger: needs-input");
	expect(prompt).toContain("Some message coverage is unavailable.");
	expect(prompt).toContain("An unproven complete assistant message.");
});

test("a completed user correction updates standalone session context", async () => {
	const correction = {
		kind: "message" as const,
		role: "user" as const,
		name: null,
		body: "Use 20 completed activity items and never a timer.",
	};
	const { calls, deps } = fixture({ hasObserverMessages: false, items: [correction] });
	await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
	const prompt = (calls.generate[0] as { userContext: string }).userContext;
	expect(prompt).toContain("Explain session progress without a worker prompt.");
	expect(prompt).toContain("TRL: Trellis");
	expect(prompt).toContain(correction.body);
	expect(prompt).toContain("Use the latest user direction when the two conflict.");
});

test("saves a capacity summary before it rolls the Claude conversation", async () => {
	const { calls, deps } = fixture({ capacityOnFirst: true });
	await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
	expect(calls.generate).toHaveLength(3);
	expect(calls.saveSummary).toHaveLength(1);
	expect(calls.rollover[0]).toMatchObject({
		expectedProviderSessionId: "provider-session-1",
		summaryMessageId: "01M3Q1029QFFHAX2H0YZXYD10",
	});
	expect(calls.save[0]).toMatchObject({ messages: [{ role: "assistant", body: "The project account." }] });
});

test("a retry retains its saved summary and all unconsumed activity", async () => {
	const summary = message({
		generation: 1,
		position: 0,
		role: "user",
		body: "# Incremental observer context summary\n\nSaved project context.",
	});
	const correction = {
		kind: "message" as const,
		role: "user" as const,
		name: null,
		body: "Keep the worker uninterrupted.",
	};
	const { calls, deps } = fixture({ messages: [summary], items: [...activity, correction] });
	await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
	const prompt = (calls.generate[0] as { userContext: string }).userContext;
	expect(prompt).toContain("Saved project context.");
	expect(prompt).toContain("tool-20");
	expect(prompt).toContain(correction.body);
	expect(calls.save[0]).toMatchObject({
		throughCursor: "cursor-2",
		messages: [{ role: "user" }, { role: "assistant", body: "The project account." }],
	});
});

test("a disable can discard a late Claude result", async () => {
	const { calls, deps } = fixture({ save: null });
	const result = await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
	expect(result).toEqual({ checked: 1, saved: 0, failed: 0 });
	expect(calls.save).toHaveLength(1);
});

test("a Claude error keeps the prior update and records the failure", async () => {
	const { calls, deps } = fixture({ generateError: new Error("private failure") });
	const result = await prepareSessionObserverGenerations({ log: () => {} } as unknown as IoCtx, {}, deps);
	expect(result).toEqual({ checked: 1, saved: 0, failed: 1 });
	expect(calls.save).toEqual([]);
	expect(calls.fail).toEqual([
		{
			runId,
			claimId: "claim-1",
			error: { code: "CLAUDE_GENERATION_FAILED", message: "The Claude observer could not write an update." },
		},
	]);
});

test("boot recovery stops each abandoned observer attempt before dispatch", async () => {
	const { calls, deps } = fixture({});
	deps.recoverClaims = async () => [
		{ runId, observerRunId: observerId },
		{ runId: "01M3Q1029QFFHAX2H0YZXYD8KV", observerRunId: null },
	];
	const result = await recoverSessionObserverGeneration({ log: () => {} } as unknown as IoCtx, {}, deps);
	expect(result).toEqual({ recovered: 2 });
	expect(calls.recoverAttempt).toEqual([{ observerRunId: observerId }]);
});

test("boot recovery checks every abandoned attempt before it reports a failure", async () => {
	const { calls, deps } = fixture({});
	const secondObserverRunId = "01M3Q1029QFFHAX2H0YZXYD8KV";
	deps.recoverClaims = async () => [
		{ runId, observerRunId: observerId },
		{ runId: "01M3Q1029QFFHAX2H0YZXYD8KW", observerRunId: secondObserverRunId },
	];
	deps.recoverAttempt = async (_ctx, input) => {
		calls.recoverAttempt.push(input);
		if (input.observerRunId === observerId) throw new Error("The first attempt did not stop.");
	};
	await expect(recoverSessionObserverGeneration({ log: () => {} } as unknown as IoCtx, {}, deps)).rejects.toThrow(
		"The first attempt did not stop.",
	);
	expect(calls.recoverAttempt).toEqual([{ observerRunId: observerId }, { observerRunId: secondObserverRunId }]);
});
