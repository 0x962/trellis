import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";
import { invalidInput } from "../../../../errors.ts";
import { ObserverHarnessError } from "../../../sessionObserverTypes/index.ts";
import type { IoCtx } from "../../../support.ts";
import { getRun } from "../../queries.ts";

// A person asks for this when the hidden Claude conversation of an observer
// stopped answering. The observer keeps its saved messages, its status
// updates, its workspace, and the activity it already consumed; only the
// Claude conversation identity on agent_runs.session_id becomes a fresh one.
// The next launch therefore opens an empty Claude conversation and carries no
// summary of the old one, because reserveObserverDelivery seeds a prompt only
// from a `session-observer-rollover` receipt and this writes none.
export const OBSERVER_RESET_REQUEST = "session-observer-reset";

type ResetTarget = {
	kind: typeof OBSERVER_RESET_REQUEST;
	sourceRunId: string;
	observerRunId: string;
	providerSessionId: string;
	priorProviderSessionId: string;
	priorAttemptId: string | null;
};

export type ResetObserverConversationInput = {
	sourceRunId: string;
	observerRunId: string;
	// The Claude conversation the caller read before it asked for the reset.
	expectedProviderSessionId: string;
	// The attempt the caller already stopped. A different attempt means
	// another launch happened after that stop, so the reset refuses.
	expectedAttemptId: string | null;
	requestId: string;
};

export type ResetObserverConversation = { providerSessionId: string; replayed: boolean };

// `requestId` is scoped to the actor, which is how agent_start_requests keys
// every other receipt. A repeat under the same actor and ID returns the first
// result. A different reset, or an unrelated assignment that already holds the
// ID, is refused instead of silently replayed.
export async function resetObserverConversation(
	ctx: IoCtx,
	tx: Tx,
	input: ResetObserverConversationInput,
): Promise<ResetObserverConversation> {
	const [receipt] = await rows<{ target: Partial<ResetTarget> }>(
		tx,
		sql`SELECT target FROM agent_start_requests WHERE actor_kind=${ctx.actor.kind}
				AND actor_name=${ctx.actor.name} AND request_id=${input.requestId}`,
	);
	const run = await getRun(tx, input.observerRunId);
	if (receipt) {
		const target = receipt.target;
		if (
			target.kind !== OBSERVER_RESET_REQUEST ||
			target.sourceRunId !== input.sourceRunId ||
			target.observerRunId !== input.observerRunId ||
			target.priorProviderSessionId !== input.expectedProviderSessionId
		)
			throw invalidInput("requestId", "This request ID already belongs to a different request.");
		if (run.sessionId !== target.providerSessionId)
			throw new ObserverHarnessError(
				"OBSERVER_CONVERSATION_LOST",
				"The observer conversation changed after this reset. Read its current identity.",
			);
		return { providerSessionId: target.providerSessionId as string, replayed: true };
	}
	if (run.sessionId !== input.expectedProviderSessionId)
		throw new ObserverHarnessError(
			"OBSERVER_CONVERSATION_LOST",
			"The saved observer conversation changed. Read its current identity before a reset.",
		);
	if (run.terminalId !== input.expectedAttemptId)
		throw new ObserverHarnessError(
			"OBSERVER_CANCEL_UNCONFIRMED",
			"The observer started another attempt. Stop it before a reset.",
		);
	const providerSessionId = randomUUID();
	const target: ResetTarget = {
		kind: OBSERVER_RESET_REQUEST,
		sourceRunId: input.sourceRunId,
		observerRunId: run.id,
		providerSessionId,
		priorProviderSessionId: input.expectedProviderSessionId,
		priorAttemptId: run.terminalId,
	};
	await tx.execute(sql`INSERT INTO agent_start_requests (request_id,actor_kind,actor_name,run_id,target,created_at)
				VALUES (${input.requestId},${ctx.actor.kind},${ctx.actor.name},${run.id},
				${JSON.stringify(target)}::jsonb,${ctx.now()})`);
	const changed = await rows(
		tx,
		sql`UPDATE agent_runs SET session_id=${providerSessionId},updated_at=${ctx.now()}
				WHERE id=${run.id} AND session_id=${input.expectedProviderSessionId} RETURNING id`,
	);
	if (changed.length !== 1)
		throw new ObserverHarnessError(
			"OBSERVER_CONVERSATION_LOST",
			"The saved observer conversation changed during reset.",
		);
	return { providerSessionId, replayed: false };
}
