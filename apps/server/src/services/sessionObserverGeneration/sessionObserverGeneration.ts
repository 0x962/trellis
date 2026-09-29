import type { ServiceCtx } from "../../context.ts";
import type { IoCtx } from "../support.ts";
import { beginSessionObserverGeneration, endSessionObserverGeneration } from "./cancelSessionObserverGeneration.ts";
import { sessionObserverGenerationError } from "./generateSessionObserverNarrative.ts";
import {
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
	_input: unknown,
	deps: SessionObserverGenerationDeps,
) => {
	const candidates = await deps.candidates(ctx);
	const results = await Promise.all(candidates.map((candidate) => dispatchCandidate(ctx, deps, candidate)));
	return {
		checked: candidates.length,
		saved: results.filter((result) => result === "saved").length,
		failed: results.filter((result) => result === "failed").length,
	};
};

export const finishSessionObserverGenerations = (
	_ctx: ServiceCtx,
	_tx: unknown,
	input: { checked: number; saved: number; failed: number },
) => Promise.resolve(input);
