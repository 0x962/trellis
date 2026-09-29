import { expect, test } from "bun:test";
import type { SessionObserverMessage } from "@trellis/api";
import type { IoCtx } from "../support.ts";
import {
	prepareSessionObserverGenerations,
	recoverSessionObserverGeneration,
	type SessionObserverGenerationDeps,
} from "./sessionObserverGeneration.ts";
import type { SessionObserverActivityItem } from "./sessionObserverPrompt.ts";

const runId = "01M3Q1029QFFHAX2H0YZXYD8KS";
const observerId = "01M3Q1029QFFHAX2H0YZXYD8KT";
const activity = Array.from({ length: 20 }, (_, index) => ({
	kind: "tool" as const,
	role: null,
	name: `tool-${index + 1}`,
	body: `result-${index + 1}`,
}));

const projectContext = {
	goal: "Explain session progress without a worker prompt.",
	project: { key: "TRL", name: "Trellis", description: "Build a tracker for work with coding agents." },
	ticket: null,
	epic: null,
};

const message = (input: { generation: number; position: number; role: "user" | "assistant"; body: string }) =>
	({
		id: `01M3Q1029QFFHAX2H0YZXYD${input.position + 10}`,
		observerId,
		createdAt: "2026-09-29T17:00:00.000Z",
		...input,
	}) as SessionObserverMessage;

const reply = (text: string, providerSessionId = "provider-session-1") => ({
	text,
	observerRunId: observerId,
	attemptId: crypto.randomUUID(),
	providerSessionId,
	messageId: crypto.randomUUID(),
	resultId: crypto.randomUUID(),
	modelId: "anthropic/claude-sonnet-5.5",
	usage: { source: "claude-transcript" as const, requests: [] },
});

const fixture = (options: {
	hasInitialUpdate?: boolean;
	completed?: boolean;
	needsInput?: boolean;
	unavailable?: boolean;
	items?: SessionObserverActivityItem[];
	context?: Array<{ kind: "message"; role: "assistant"; body: string }>;
	messages?: SessionObserverMessage[];
	save?: object | null;
	generateError?: Error;
	capacityOnFirst?: boolean;
}) => {
	const calls = {
		claim: [] as unknown[],
		generate: [] as unknown[],
		saveSummary: [] as unknown[],
		rollover: [] as unknown[],
		save: [] as unknown[],
		fail: [] as unknown[],
		recoverAttempt: [] as unknown[],
	};
	let generated = 0;
	const claim = {
		observerId,
		runId,
		observerRunId: observerId,
		generation: 1,
		claimId: "claim-1",
		fromCursor: "cursor-1",
		throughCursor: "cursor-2",
		messages: options.messages ?? [],
	};
	const deps: SessionObserverGenerationDeps = {
		candidates: async () => [
			{
				runId,
				lastConsumedCursor: "cursor-1",
				hasInitialUpdate: options.hasInitialUpdate ?? true,
				activityThreshold: 20,
			},
		],
		activity: async () => ({
			cursor: "cursor-2",
			items: options.items ?? activity,
			context: options.context ?? [],
			completed: options.completed ?? false,
			needsInput: options.needsInput ?? false,
			unavailable: options.unavailable ?? false,
		}),
		claim: async (_ctx, input) => {
			calls.claim.push(input);
			return { ...claim, throughCursor: input.throughCursor };
		},
		ensureRun: async () => ({ observerRunId: observerId }),
		linkRun: async () => claim,
		context: async () => projectContext,
		generate: async (_ctx, input) => {
			calls.generate.push(input);
			generated += 1;
			if (options.capacityOnFirst && generated === 1)
				throw Object.assign(new Error("capacity"), { code: "OBSERVER_CONTEXT_CAPACITY" });
			if (options.generateError !== undefined) throw options.generateError;
			return reply(generated === 2 && options.capacityOnFirst ? "Saved context." : "The project account.");
		},
		saveSummary: async (_ctx, input) => {
			calls.saveSummary.push(input);
			return message({ generation: 1, position: 0, role: "user", body: input.message.body });
		},
		rollover: async (_ctx, input) => {
			calls.rollover.push(input);
			return { providerSessionId: "provider-session-2" };
		},
		save: async (_ctx, input) => {
			calls.save.push(input);
			return options.save === undefined ? {} : options.save;
		},
		fail: async (_ctx, input) => {
			calls.fail.push(input);
			return {};
		},
		recoverClaims: async () => [],
		recoverAttempt: async (_ctx, input) => {
			calls.recoverAttempt.push(input);
		},
	};
	return { calls, deps };
};

test("saves one update through the exact activity cursor", async () => {
	const { calls, deps } = fixture({});
	const result = await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	expect(result).toEqual({ checked: 1, saved: 1, failed: 0 });
	expect(calls.claim).toEqual([{ runId, throughCursor: "cursor-2" }]);
	expect(calls.save[0]).toMatchObject({ throughCursor: "cursor-2", update: { body: "The project account." } });
	expect(calls.generate[0]).toMatchObject({ throughCursor: "cursor-2", deliveryId: "narrative" });
});

test("idle time alone makes no Claude call", async () => {
	const { calls, deps } = fixture({ items: activity.slice(0, 19) });
	const result = await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	expect(result).toEqual({ checked: 1, saved: 0, failed: 0 });
	expect(calls.claim).toEqual([]);
	expect(calls.generate).toEqual([]);
});

test("completion and a request for human input bypass the count", async () => {
	for (const signal of [{ completed: true }, { needsInput: true }]) {
		const { calls, deps } = fixture({ ...signal, items: [] });
		await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
		expect(calls.generate).toHaveLength(1);
	}
});

test("initial generation works when activity is unavailable", async () => {
	const { calls, deps } = fixture({ hasInitialUpdate: false, items: [], unavailable: true });
	await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	expect(calls.generate).toHaveLength(1);
	expect((calls.generate[0] as { userContext: string }).userContext).toContain("Some message coverage is unavailable.");
});

test("20 completed tools reach the threshold when message coverage is unavailable", async () => {
	const { calls, deps } = fixture({ unavailable: true });
	await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
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
	await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
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
	const { calls, deps } = fixture({ hasInitialUpdate: false, items: [correction] });
	await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	const prompt = (calls.generate[0] as { userContext: string }).userContext;
	expect(prompt).toContain("Explain session progress without a worker prompt.");
	expect(prompt).toContain("TRL: Trellis");
	expect(prompt).toContain(correction.body);
	expect(prompt).toContain("Use the latest user direction when the two conflict.");
});

test("saves a capacity summary before it rolls the Claude conversation", async () => {
	const { calls, deps } = fixture({ capacityOnFirst: true });
	await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	expect(calls.generate).toHaveLength(3);
	expect(calls.saveSummary).toHaveLength(1);
	expect(calls.rollover[0]).toMatchObject({
		expectedProviderSessionId: "provider-session-1",
		summaryMessageId: "01M3Q1029QFFHAX2H0YZXYD10",
	});
	expect(calls.save[0]).toMatchObject({ messages: [{ role: "assistant", body: "The project account." }] });
});

test("a retry continues from its saved summary without copying the failed activity", async () => {
	const summary = message({
		generation: 1,
		position: 0,
		role: "user",
		body: "# Incremental observer context summary\n\nSaved project context.",
	});
	const { calls, deps } = fixture({ messages: [summary] });
	await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	expect((calls.generate[0] as { userContext: string }).userContext).toBe(
		"Use the saved incremental observer context summary to write the project update.",
	);
	expect((calls.generate[0] as { userContext: string }).userContext).not.toContain("tool-20");
	expect(calls.save[0]).toMatchObject({ messages: [{ role: "assistant", body: "The project account." }] });
});

test("a disable can discard a late Claude result", async () => {
	const { calls, deps } = fixture({ save: null });
	const result = await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	expect(result).toEqual({ checked: 1, saved: 0, failed: 0 });
	expect(calls.save).toHaveLength(1);
});

test("a Claude error keeps the prior update and records the failure", async () => {
	const { calls, deps } = fixture({ generateError: new Error("private failure") });
	const result = await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
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
	const result = await recoverSessionObserverGeneration({} as IoCtx, {}, deps);
	expect(result).toEqual({ recovered: 2 });
	expect(calls.recoverAttempt).toEqual([{ observerRunId: observerId }]);
});
