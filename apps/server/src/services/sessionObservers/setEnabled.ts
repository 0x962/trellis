import {
	SESSION_OBSERVER_ACTIVITY_THRESHOLD,
	SESSION_OBSERVER_MODEL_ID,
	type SessionObserver,
	type SessionObserverSetEnabledInput,
	SessionObserverSetEnabledInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { resolveSessionUpdateOwner } from "../sessionUpdates/owner.ts";
import { emptySessionObserver, readSessionObserver, sessionObserverByRun } from "./queries.ts";

export type SetSessionObserverEnabledResult = {
	observer: SessionObserver;
	cancelGeneration: boolean;
	requestInitialGeneration: boolean;
};

const providerError = "Configure an enabled Vercel AI Gateway provider.";

const observerProvider = async (tx: Tx): Promise<string | null> => {
	const [provider] = await rows<{ id: string }>(
		tx,
		sql`SELECT p.id FROM providers p WHERE p.enabled AND p.kind='vercel-ai-gateway'
		ORDER BY p.created_at, p.id LIMIT 1`,
	);
	return provider?.id ?? null;
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
		const providerId = await observerProvider(tx);
		await tx.execute(sql`INSERT INTO session_observers
			(run_id, observer_id, enabled, provider_id, model_id, activity_threshold, error, created_at, updated_at)
			VALUES (${owner.runId}, ${observerId}, true, ${providerId}, ${SESSION_OBSERVER_MODEL_ID},
			${input.activityThreshold ?? SESSION_OBSERVER_ACTIVITY_THRESHOLD}, ${providerId === null ? providerError : null},
			${ctx.now}, ${ctx.now})`);
		return {
			observer: await readSessionObserver(tx, owner.runId),
			cancelGeneration: false,
			requestInitialGeneration: providerId !== null,
		};
	}
	const providerId = input.enabled && existing.providerId === null ? await observerProvider(tx) : existing.providerId;
	const error =
		input.enabled && providerId === null ? providerError : existing.providerId === null ? null : existing.error;
	const cancelGeneration = existing.enabled && existing.generationState === "generating" && !input.enabled;
	await tx.execute(sql`UPDATE session_observers SET enabled=${input.enabled},
		provider_id=${providerId}, error=${error},
		activity_threshold=${input.activityThreshold ?? existing.activityThreshold},
		generation_state=CASE WHEN ${input.enabled} THEN generation_state ELSE 'idle' END,
		generation_claim_id=CASE WHEN ${input.enabled} THEN generation_claim_id ELSE NULL END,
		generation_cursor=CASE WHEN ${input.enabled} THEN generation_cursor ELSE NULL END,
		updated_at=${ctx.now} WHERE run_id=${owner.runId}`);
	return {
		observer: await readSessionObserver(tx, owner.runId),
		cancelGeneration,
		requestInitialGeneration:
			input.enabled && providerId !== null && (!existing.enabled || existing.providerId === null),
	};
};

export const setEnabledForProcedure = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: SessionObserverSetEnabledInput,
): Promise<SessionObserver> => (await setEnabled(ctx, tx, input)).observer;
