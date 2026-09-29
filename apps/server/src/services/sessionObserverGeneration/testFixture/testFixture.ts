import type { SessionObserverMessage } from "@trellis/api";
import type { SessionObserverGenerationDeps } from "../sessionObserverGenerationDeps.ts";
import type { SessionObserverActivityItem } from "../sessionObserverPrompt.ts";

export const runId = "01M3Q1029QFFHAX2H0YZXYD8KS";
export const observerId = "01M3Q1029QFFHAX2H0YZXYD8KT";
export const activity = Array.from({ length: 20 }, (_, index) => ({
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

export const message = (input: { generation: number; position: number; role: "user" | "assistant"; body: string }) =>
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

export const fixture = (options: {
	hasObserverMessages?: boolean;
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
				hasObserverMessages: options.hasObserverMessages ?? true,
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
