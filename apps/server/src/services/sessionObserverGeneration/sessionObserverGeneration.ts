import {
	SESSION_OBSERVER_MODEL_ID,
	type SessionObserverError,
	type SessionObserverSetEnabledInput,
} from "@trellis/api";
import type { Tx } from "../../db/tx.ts";
import { ObserverHarnessError } from "../sessionObserverHarness";
import { type SessionObserverGenerationClaim, setEnabled } from "../sessionObservers";
import type { IoCtx } from "../support.ts";
import {
	beginSessionObserverGeneration,
	cancelSessionObserverGeneration,
	endSessionObserverGeneration,
} from "./cancelSessionObserverGeneration.ts";
import {
	generateSessionObserverNarrative,
	type SessionObserverMessage as NarrativeMessage,
} from "./generateSessionObserverNarrative.ts";
import { dependencies, type SessionObserverGenerationDeps } from "./sessionObserverGenerationDeps.ts";
import { type SessionObserverTrigger, sessionObserverInput } from "./sessionObserverPrompt.ts";
import { type SessionObserverGenerationCandidate, sessionObserverTrigger } from "./sessionObserverTrigger.ts";

export type { SessionObserverGenerationDeps } from "./sessionObserverGenerationDeps.ts";

type SessionObserverGenerationInput = { runId?: string; force?: boolean };

class InactiveSessionObserverClaim extends Error {}

const observerError = (error: unknown): SessionObserverError => {
	if (!(error instanceof ObserverHarnessError))
		return { code: "CLAUDE_GENERATION_FAILED", message: "The Claude observer could not write an update." };
	if (error.code === "OBSERVER_ACCOUNT_UNAVAILABLE")
		return { code: "CLAUDE_ACCOUNT_UNAVAILABLE", message: error.message };
	if (error.code === "OBSERVER_MODEL_UNAVAILABLE") return { code: "CLAUDE_MODEL_UNAVAILABLE", message: error.message };
	if (error.code === "OBSERVER_CONVERSATION_LOST") return { code: "CLAUDE_CONVERSATION_LOST", message: error.message };
	if (
		error.code === "OBSERVER_DELIVERY_UNKNOWN" ||
		error.code === "OBSERVER_REPLY_INCOMPLETE" ||
		error.code === "OBSERVER_CANCEL_UNCONFIRMED"
	)
		return { code: "CLAUDE_LAUNCH_UNCONFIRMED", message: error.message };
	return { code: "CLAUDE_GENERATION_FAILED", message: error.message };
};

const ensureClaimRun = async (
	ctx: IoCtx,
	deps: SessionObserverGenerationDeps,
	claim: SessionObserverGenerationClaim,
) => {
	if (claim.observerRunId !== null) return claim;
	const run = await deps.ensureRun(ctx, {
		observerId: claim.observerId,
		sourceRunId: claim.runId,
		modelId: SESSION_OBSERVER_MODEL_ID,
	});
	return deps.linkRun(ctx, { runId: claim.runId, claimId: claim.claimId, observerRunId: run.observerRunId });
};

const dispatchCandidate = async (
	ctx: IoCtx,
	deps: SessionObserverGenerationDeps,
	candidate: SessionObserverGenerationCandidate,
	force: boolean,
) => {
	const activity = await deps.activity(ctx, {
		runId: candidate.runId,
		cursor: candidate.lastConsumedCursor,
	});
	const trigger: SessionObserverTrigger | null = force
		? "initial"
		: sessionObserverTrigger(candidate, {
				itemCount: activity.items.length,
				completed: activity.completed,
				needsInput: activity.needsInput,
				unavailable: activity.unavailable,
			});
	if (trigger === null) return "not-due" as const;
	const claimed = await deps.claim(ctx, { runId: candidate.runId, throughCursor: activity.cursor });
	if (claimed === null) return "not-claimed" as const;

	const controller = beginSessionObserverGeneration(candidate.runId);
	try {
		const claim = await ensureClaimRun(ctx, deps, claimed);
		if (claim === null || claim.observerRunId === null) return "discarded" as const;
		const observerRunId = claim.observerRunId;
		const context = await deps.context(ctx, { runId: candidate.runId });
		const userMessage = sessionObserverInput({
			context,
			activity: activity.items,
			uncertainActivity: activity.context,
			activityUnavailable: activity.unavailable,
			trigger,
		});
		const messages: NarrativeMessage[] = [
			...claim.messages.map(({ role, body }) => ({ role, body })),
			{ role: "user", body: userMessage },
		];
		const generate = (turn: { instruction: string; userContext: string; deliveryId: string }) =>
			deps.generate(ctx, {
				observerId: claim.observerId,
				observerRunId,
				sourceRunId: claim.runId,
				claimId: claim.claimId,
				throughCursor: claim.throughCursor,
				deliveryId: turn.deliveryId,
				instruction: turn.instruction,
				userContext: turn.userContext,
				signal: controller.signal,
			});
		const result = await generateSessionObserverNarrative(
			{
				messages,
				beforeNarrativeAfterSummary: async (summary, generations) => {
					const saved = await deps.saveSummary(ctx, {
						runId: claim.runId,
						claimId: claim.claimId,
						message: summary,
					});
					if (saved === null) throw new InactiveSessionObserverClaim();
					const providerSessionId = generations.at(-1)?.providerSessionId;
					if (providerSessionId === undefined) throw new Error("The observer summary has no conversation identity.");
					await deps.rollover(ctx, {
						sourceRunId: claim.runId,
						observerRunId,
						claimId: claim.claimId,
						expectedProviderSessionId: providerSessionId,
						summaryMessageId: saved.id,
					});
				},
			},
			generate,
		);
		const saved = await deps.save(ctx, {
			runId: candidate.runId,
			claimId: claim.claimId,
			throughCursor: claim.throughCursor,
			messages: [
				...(result.incrementalSummary !== null ? [] : [{ role: "user" as const, body: userMessage }]),
				{ role: "assistant", body: result.generation.text },
			],
			update: { body: result.generation.text },
		});
		return saved === null ? ("discarded" as const) : ("saved" as const);
	} catch (error) {
		if (error instanceof InactiveSessionObserverClaim) return "discarded" as const;
		await deps.fail(ctx, {
			runId: candidate.runId,
			claimId: claimed.claimId,
			error: observerError(error),
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
	const results = await Promise.all(
		candidates.map((candidate) => dispatchCandidate(ctx, deps, candidate, input.force ?? false)),
	);
	return {
		checked: candidates.length,
		saved: results.filter((result) => result === "saved").length,
		failed: results.filter((result) => result === "failed").length,
	};
};

export const requestSessionObserverGeneration = (ctx: IoCtx, runId: string) =>
	prepareSessionObserverGenerations(ctx, { runId, force: true });

export const recoverSessionObserverGeneration = async (
	ctx: IoCtx,
	_input: Record<string, never>,
	deps: SessionObserverGenerationDeps = dependencies,
) => {
	const claims = await deps.recoverClaims(ctx);
	const attempts = await Promise.allSettled(
		claims.flatMap((claim) =>
			claim.observerRunId === null ? [] : [deps.recoverAttempt(ctx, { observerRunId: claim.observerRunId })],
		),
	);
	const failed = attempts.find((attempt) => attempt.status === "rejected");
	if (failed?.status === "rejected") throw failed.reason;
	return { recovered: claims.length };
};

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

export const finishSessionObserverRecovery = (_ctx: IoCtx, _tx: Tx, input: { recovered: number }) =>
	Promise.resolve(input);
