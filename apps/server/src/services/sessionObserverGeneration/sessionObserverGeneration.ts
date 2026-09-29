import type { SessionObserverSetEnabledInput } from "@trellis/api";
import type { Tx } from "../../db/tx.ts";
import type { SessionObserverActivityItem as StoredActivityItem } from "../sessionObserverActivity";
import {
	readSessionObserverActivity,
	type SessionObserverActivityContext as StoredActivityContext,
} from "../sessionObserverActivity";
import {
	claimSessionObserverGeneration,
	failSessionObserverGeneration,
	listSessionObserverCandidates,
	saveSessionObserverGeneration,
	setEnabled,
} from "../sessionObservers";
import type { IoCtx } from "../support.ts";
import {
	beginSessionObserverGeneration,
	cancelSessionObserverGeneration,
	endSessionObserverGeneration,
} from "./cancelSessionObserverGeneration.ts";
import {
	generateSessionObserverNarrative,
	sessionObserverGenerationError,
} from "./generateSessionObserverNarrative.ts";
import { readSessionObserverContext } from "./sessionObserverContext.ts";
import {
	type SessionObserverActivityContext,
	type SessionObserverActivityItem,
	type SessionObserverProjectContext,
	sessionObserverInput,
	sessionObserverInstruction,
} from "./sessionObserverPrompt.ts";
import type { SessionObserverGenerationCandidate } from "./sessionObserverTrigger.ts";
import { sessionObserverTrigger } from "./sessionObserverTrigger.ts";

type ObserverMessage = { role: "user" | "assistant"; body: string };

type ObserverActivityRead = {
	cursor: string;
	items: SessionObserverActivityItem[];
	context: SessionObserverActivityContext[];
	completed: boolean;
	needsInput: boolean;
	unavailable: boolean;
};

type ObserverGenerationClaim = {
	runId: string;
	providerId: string;
	modelId: string;
	claimId: string;
	throughCursor: string;
	messages: ObserverMessage[];
};

type ObserverGenerationResult = {
	text: string;
	incrementalSummary: ObserverMessage | null;
};

type SessionObserverGenerationInput = { runId?: string };

export type SessionObserverGenerationDeps = {
	candidates: (ctx: IoCtx) => Promise<SessionObserverGenerationCandidate[]>;
	activity: (ctx: IoCtx, input: { runId: string; cursor: string | null }) => Promise<ObserverActivityRead>;
	claim: (ctx: IoCtx, input: { runId: string; throughCursor: string }) => Promise<ObserverGenerationClaim | null>;
	context: (ctx: IoCtx, input: { runId: string }) => Promise<SessionObserverProjectContext>;
	generate: (
		ctx: IoCtx,
		input: {
			providerId: string;
			modelId: string;
			instruction: string;
			messages: ObserverMessage[];
			signal: AbortSignal;
		},
	) => Promise<ObserverGenerationResult>;
	save: (
		ctx: IoCtx,
		input: {
			runId: string;
			claimId: string;
			throughCursor: string;
			messages: ObserverMessage[];
			update: { body: string };
		},
	) => Promise<unknown | null>;
	fail: (ctx: IoCtx, input: { runId: string; claimId: string; error: string }) => Promise<unknown | null>;
};

const activityItem = (item: StoredActivityItem): SessionObserverActivityItem =>
	item.kind === "message"
		? { kind: "message", role: item.role, name: null, body: item.text }
		: {
				kind: "tool",
				role: null,
				name: item.tool.name,
				body: JSON.stringify({
					...(item.tool.input === undefined ? {} : { input: item.tool.input }),
					...(item.tool.output === undefined ? {} : { output: item.tool.output }),
					...(item.tool.updates === undefined ? {} : { updates: item.tool.updates }),
					...(item.error === undefined ? {} : { error: item.error }),
				}),
			};

const activityContext = (item: StoredActivityContext): SessionObserverActivityContext => ({
	kind: "message",
	role: item.role,
	body: item.text,
});

const dependencies: SessionObserverGenerationDeps = {
	candidates: (ctx) => ctx.newTx(listSessionObserverCandidates),
	activity: async (ctx, input) => {
		const read = await readSessionObserverActivity(ctx, { runId: input.runId, after: input.cursor });
		return {
			cursor: read.cursor,
			items: read.items.map(activityItem),
			context: read.context.map(activityContext),
			completed: read.signals.some((signal) => signal.kind === "completion"),
			needsInput: read.signals.some((signal) => signal.kind === "input-request"),
			unavailable: read.signals.some(
				(signal) =>
					signal.kind === "unavailable" ||
					(signal.kind === "completion" && signal.messageAvailability === "unavailable"),
			),
		};
	},
	claim: (ctx, input) => ctx.newTx((tx) => claimSessionObserverGeneration(tx, input)),
	context: (ctx, input) => ctx.newTx((tx) => readSessionObserverContext(ctx.core, tx, input)),
	generate: async (ctx, input) => {
		const result = await generateSessionObserverNarrative(ctx, {
			providerId: input.providerId,
			model: input.modelId,
			messages: input.messages,
			signal: input.signal,
		});
		return { text: result.generation.text, incrementalSummary: result.incrementalSummary };
	},
	save: (ctx, input) => ctx.newTx((tx) => saveSessionObserverGeneration(ctx.core, tx, input)),
	fail: (ctx, input) => ctx.newTx((tx) => failSessionObserverGeneration(ctx.core, tx, input)),
};

const dispatchCandidate = async (
	ctx: IoCtx,
	deps: SessionObserverGenerationDeps,
	candidate: SessionObserverGenerationCandidate,
) => {
	const activity = await deps.activity(ctx, {
		runId: candidate.runId,
		cursor: candidate.lastConsumedCursor,
	});
	const trigger = sessionObserverTrigger(candidate, {
		itemCount: activity.items.length,
		completed: activity.completed,
		needsInput: activity.needsInput,
		unavailable: activity.unavailable,
	});
	if (trigger === null) return "not-due" as const;
	const claim = await deps.claim(ctx, { runId: candidate.runId, throughCursor: activity.cursor });
	if (claim === null) return "not-claimed" as const;

	const controller = beginSessionObserverGeneration(candidate.runId);
	try {
		const context = await deps.context(ctx, { runId: candidate.runId });
		const userMessage = sessionObserverInput({
			context,
			activity: activity.items,
			uncertainActivity: activity.context,
			activityUnavailable: activity.unavailable,
			trigger,
		});
		const result = await deps.generate(ctx, {
			providerId: claim.providerId,
			modelId: claim.modelId,
			instruction: sessionObserverInstruction,
			messages: [...claim.messages, { role: "user", body: userMessage }],
			signal: controller.signal,
		});
		const savedMessages =
			result.incrementalSummary === null
				? [
						{ role: "user" as const, body: userMessage },
						{ role: "assistant" as const, body: result.text },
					]
				: [result.incrementalSummary, { role: "assistant" as const, body: result.text }];
		const saved = await deps.save(ctx, {
			runId: candidate.runId,
			claimId: claim.claimId,
			throughCursor: claim.throughCursor,
			messages: savedMessages,
			update: { body: result.text },
		});
		return saved === null ? ("discarded" as const) : ("saved" as const);
	} catch (error) {
		await deps.fail(ctx, {
			runId: candidate.runId,
			claimId: claim.claimId,
			error: sessionObserverGenerationError(error),
		});
		return "failed" as const;
	} finally {
		endSessionObserverGeneration(candidate.runId, controller);
	}
};

export const prepareSessionObserverGenerations = async (
	ctx: IoCtx,
	input: SessionObserverGenerationInput,
	deps: SessionObserverGenerationDeps = dependencies,
) => {
	const candidates = (await deps.candidates(ctx)).filter(
		(candidate) => input.runId === undefined || candidate.runId === input.runId,
	);
	const results = await Promise.all(candidates.map((candidate) => dispatchCandidate(ctx, deps, candidate)));
	return {
		checked: candidates.length,
		saved: results.filter((result) => result === "saved").length,
		failed: results.filter((result) => result === "failed").length,
	};
};

export const requestSessionObserverGeneration = (ctx: IoCtx, runId: string) =>
	prepareSessionObserverGenerations(ctx, { runId });

export const setSessionObserverEnabled = async (ctx: IoCtx, tx: Tx, input: SessionObserverSetEnabledInput) => {
	const result = await setEnabled(ctx.core, tx, input);
	ctx.afterCommit(async () => {
		if (result.cancelGeneration) cancelSessionObserverGeneration(ctx.core, result.observer.runId);
		if (result.requestInitialGeneration) await requestSessionObserverGeneration(ctx, result.observer.runId);
	});
	return result.observer;
};

export const finishSessionObserverGenerations = (
	_ctx: IoCtx,
	_tx: Tx,
	input: { checked: number; saved: number; failed: number },
) => Promise.resolve(input);
