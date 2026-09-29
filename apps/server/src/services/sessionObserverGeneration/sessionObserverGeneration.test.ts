import { expect, test } from "bun:test";
import type { IoCtx } from "../support.ts";
import { prepareSessionObserverGenerations, type SessionObserverGenerationDeps } from "./sessionObserverGeneration.ts";

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

const fixture = (options: {
	hasInitialUpdate?: boolean;
	completed?: boolean;
	needsInput?: boolean;
	unavailable?: boolean;
	items?: typeof activity;
	context?: Array<{ kind: "message"; role: "assistant"; body: string }>;
	save?: object | null;
	generateError?: Error;
}) => {
	const calls = { claim: [] as unknown[], generate: [] as unknown[], save: [] as unknown[], fail: [] as unknown[] };
	const deps: SessionObserverGenerationDeps = {
		candidates: async () => [
			{
				runId: "01M3Q1029QFFHAX2H0YZXYD8KS",
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
			return {
				runId: input.runId,
				providerId: "01M3Q1029QFFHAX2H0YZXYD8KA",
				modelId: "anthropic/claude-sonnet-5.5",
				claimId: "claim-1",
				throughCursor: input.throughCursor,
				messages: [],
			};
		},
		context: async () => projectContext,
		generate: async (_ctx, input) => {
			calls.generate.push(input);
			if (options.generateError !== undefined) throw options.generateError;
			return { text: "The project account.", incrementalSummary: null };
		},
		save: async (_ctx, input) => {
			calls.save.push(input);
			return options.save === undefined ? {} : options.save;
		},
		fail: async (_ctx, input) => {
			calls.fail.push(input);
			return {};
		},
	};
	return { calls, deps };
};

test("saves one update through the exact activity cursor", async () => {
	const { calls, deps } = fixture({});
	const result = await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	expect(result).toEqual({ checked: 1, saved: 1, failed: 0 });
	expect(calls.claim).toEqual([{ runId: "01M3Q1029QFFHAX2H0YZXYD8KS", throughCursor: "cursor-2" }]);
	expect(calls.save[0]).toMatchObject({ throughCursor: "cursor-2", update: { body: "The project account." } });
});

test("idle time alone makes no provider call", async () => {
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
	expect((calls.generate[0] as { messages: Array<{ body: string }> }).messages.at(-1)?.body).toContain(
		"Some message coverage is unavailable.",
	);
});

test("20 completed tools trigger with unavailable messages, signals, and uncertain context", async () => {
	const { calls, deps } = fixture({
		unavailable: true,
		completed: true,
		needsInput: true,
		context: [{ kind: "message", role: "assistant", body: "An unproven complete assistant message." }],
	});
	await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	expect(calls.generate).toHaveLength(1);
	const prompt = (calls.generate[0] as { messages: Array<{ body: string }> }).messages.at(-1)?.body;
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
	const prompt = (calls.generate[0] as { messages: Array<{ body: string }> }).messages.at(-1)?.body;
	expect(prompt).toContain("Explain session progress without a worker prompt.");
	expect(prompt).toContain("TRL: Trellis");
	expect(prompt).toContain(correction.body);
	expect(prompt).toContain("Use the latest user direction when the two conflict.");
});

test("a disable can discard a late provider result", async () => {
	const { calls, deps } = fixture({ save: null });
	const result = await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	expect(result).toEqual({ checked: 1, saved: 0, failed: 0 });
	expect(calls.save).toHaveLength(1);
});

test("a provider error keeps the prior update and records the failure", async () => {
	const { calls, deps } = fixture({ generateError: new Error("Gateway unavailable") });
	const result = await prepareSessionObserverGenerations({} as IoCtx, {}, deps);
	expect(result).toEqual({ checked: 1, saved: 0, failed: 1 });
	expect(calls.save).toEqual([]);
	expect(calls.fail).toEqual([
		{ runId: "01M3Q1029QFFHAX2H0YZXYD8KS", claimId: "claim-1", error: "Gateway unavailable" },
	]);
});
