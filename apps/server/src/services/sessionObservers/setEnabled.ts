import {
	SESSION_OBSERVER_ACTIVITY_THRESHOLD,
	type SessionObserver,
	type SessionObserverSetEnabledInput,
	SessionObserverSetEnabledInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { resolveSessionUpdateOwner } from "../sessionUpdates/owner.ts";
import { emptySessionObserver, readSessionObserver, sessionObserverByRun } from "./queries.ts";

export type SetSessionObserverEnabledResult = {
	observer: SessionObserver;
	cancelGeneration: boolean;
	requestInitialGeneration: boolean;
};

export type DisableSessionObserverForDeletionResult = {
	observerRunId: string | null;
	cancelGeneration: boolean;
};

export const disableSessionObserverForDeletion = async (
	tx: Tx,
	input: { runId: string; now: Date },
): Promise<DisableSessionObserverForDeletionResult> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (observer === null) return { observerRunId: null, cancelGeneration: false };
	const cancelGeneration = observer.enabled && observer.generationState === "generating";
	await tx.execute(sql`UPDATE session_observers SET enabled=false, generation_state='idle',
		generation_claim_id=NULL, generation_cursor=NULL, updated_at=${input.now}
		WHERE run_id=${input.runId}`);
	return { observerRunId: observer.observerRunId, cancelGeneration };
};

export const setEnabled = async (
	ctx: ServiceCtx,
	tx: Tx,
	value: SessionObserverSetEnabledInput,
): Promise<SetSessionObserverEnabledResult> => {
	const input = SessionObserverSetEnabledInputSchema.parse(value);
	if (ctx.actor?.kind !== "human") throw invalidInput("actor", "Only a person can change the session observer.");
	const owner = await resolveSessionUpdateOwner(tx, input.sessionId);
	const existing = await sessionObserverByRun(tx, { runId: owner.runId, lock: true });
	if (existing === null && !input.enabled)
		return { observer: emptySessionObserver(owner.runId), cancelGeneration: false, requestInitialGeneration: false };
	if (existing === null) {
		const observerId = ulid();
		await tx.execute(sql`INSERT INTO session_observers
			(run_id, observer_id, enabled, activity_threshold, created_at, updated_at)
			VALUES (${owner.runId}, ${observerId}, true,
			${input.activityThreshold ?? SESSION_OBSERVER_ACTIVITY_THRESHOLD}, ${ctx.now}, ${ctx.now})`);
		return {
			observer: await readSessionObserver(tx, owner.runId),
			cancelGeneration: false,
			requestInitialGeneration: true,
		};
	}
	if (!input.enabled) {
		const disabled = await disableSessionObserverForDeletion(tx, { runId: owner.runId, now: ctx.now });
		return {
			observer: await readSessionObserver(tx, owner.runId),
			cancelGeneration: disabled.cancelGeneration,
			requestInitialGeneration: false,
		};
	}
	const becameEnabled = !existing.enabled;
	await tx.execute(sql`UPDATE session_observers SET enabled=true,
		activity_threshold=${input.activityThreshold ?? existing.activityThreshold},
		last_attempted_cursor=CASE WHEN ${becameEnabled} THEN NULL ELSE last_attempted_cursor END,
		error_code=CASE WHEN ${becameEnabled} THEN NULL ELSE error_code END,
		error=CASE WHEN ${becameEnabled} THEN NULL ELSE error END,
		updated_at=${ctx.now} WHERE run_id=${owner.runId}`);
	return {
		observer: await readSessionObserver(tx, owner.runId),
		cancelGeneration: false,
		requestInitialGeneration: becameEnabled,
	};
};

export const setEnabledForProcedure = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: SessionObserverSetEnabledInput,
): Promise<SessionObserver> => (await setEnabled(ctx, tx, input)).observer;
