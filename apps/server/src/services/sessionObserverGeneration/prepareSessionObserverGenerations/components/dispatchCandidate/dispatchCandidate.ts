import { SESSION_OBSERVER_MODEL_ID, type SessionObserverError } from "@trellis/api";
import { ObserverHarnessError } from "../../../../sessionObserverHarness";
import type { IoCtx } from "../../../../support.ts";
import {
	beginSessionObserverGeneration,
	endSessionObserverGeneration,
} from "../../../cancelSessionObserverGeneration.ts";
import {
	generateSessionObserverNarrative,
	type SessionObserverMessage as NarrativeMessage,
} from "../../../generateSessionObserverNarrative.ts";
import type { SessionObserverGenerationDeps } from "../../../sessionObserverGenerationDeps.ts";
import { type SessionObserverTrigger, sessionObserverInput } from "../../../sessionObserverPrompt.ts";
import { type SessionObserverGenerationCandidate, sessionObserverTrigger } from "../../../sessionObserverTrigger.ts";

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

export const dispatchCandidate = async (
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
	let operation = "ensure-run";
	try {
		let claim = claimed;
		if (claim.observerRunId === null) {
			const run = await deps.ensureRun(ctx, {
				observerId: claim.observerId,
				sourceRunId: claim.runId,
				modelId: SESSION_OBSERVER_MODEL_ID,
			});
			operation = "link-run";
			const linked = await deps.linkRun(ctx, {
				runId: claim.runId,
				claimId: claim.claimId,
				observerRunId: run.observerRunId,
			});
			if (linked === null) return "discarded" as const;
			claim = linked;
		}
		if (claim.observerRunId === null) return "discarded" as const;
		const observerRunId = claim.observerRunId;
		operation = "read-context";
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
		const generate = (turn: { instruction: string; userContext: string; deliveryId: string }) => {
			operation = "generate-reply";
			return deps.generate(ctx, {
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
		};
		const result = await generateSessionObserverNarrative(
			{
				messages,
				beforeNarrativeAfterSummary: async (summary, generations) => {
					operation = "save-summary";
					const saved = await deps.saveSummary(ctx, {
						runId: claim.runId,
						claimId: claim.claimId,
						message: summary,
					});
					if (saved === null) throw new InactiveSessionObserverClaim();
					const providerSessionId = generations.at(-1)?.providerSessionId;
					if (providerSessionId === undefined) throw new Error("The observer summary has no conversation identity.");
					operation = "rollover-conversation";
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
		operation = "save-update";
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
		const failure = observerError(error);
		ctx.log("session-observer.generation-failed", {
			runId: candidate.runId,
			observerId: claimed.observerId,
			claimId: claimed.claimId,
			operation,
			errorCode: failure.code,
		});
		await deps.fail(ctx, {
			runId: candidate.runId,
			claimId: claimed.claimId,
			error: failure,
		});
		return "failed" as const;
	} finally {
		endSessionObserverGeneration(candidate.runId, controller);
	}
};
