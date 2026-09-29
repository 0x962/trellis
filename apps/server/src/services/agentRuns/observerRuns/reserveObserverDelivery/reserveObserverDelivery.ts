import { sql } from "drizzle-orm";
import { rows } from "../../../../db/queries/support.ts";
import { reserveAttempt } from "../../../assignments/attempts.ts";
import { observerClaimIsActive, readObserverSummaryBody } from "../../../sessionObservers/index.ts";
import {
	ObserverHarnessError,
	SESSION_OBSERVER_MODEL,
	type SessionObserverReplyInput,
} from "../../../sessionObserverTypes/index.ts";
import type { IoCtx } from "../../../support.ts";
import { getRun } from "../../queries.ts";

import {
	type DeliveryReceipt,
	inputDigest,
	observerDeliveryReceipt,
	requestIdOf,
} from "../observerDeliveryReceipt/index.ts";

export async function reserveObserverDelivery(ctx: IoCtx, input: SessionObserverReplyInput) {
	return ctx.newTx(async (tx) => {
		if (!(await observerClaimIsActive(tx, input)))
			throw new ObserverHarnessError("OBSERVER_DISABLED", "The observer was disabled or its update was replaced.");
		const run = await getRun(tx, input.observerRunId);
		if (run.harness?.preset !== "claude" || run.harness.model !== SESSION_OBSERVER_MODEL)
			throw new ObserverHarnessError(
				"OBSERVER_MODEL_UNAVAILABLE",
				"The observer requires the exact Claude Sonnet 5.5 model.",
			);
		if (!run.sessionId)
			throw new ObserverHarnessError(
				"OBSERVER_CONVERSATION_LOST",
				"The observer has no saved Claude conversation identity.",
			);
		const digest = inputDigest(input);
		const requestId = requestIdOf(input);
		const prior = await observerDeliveryReceipt(tx, input);
		if (prior) {
			return { run, replay: true as const, attemptId: prior.attemptId, providerSessionId: prior.providerSessionId };
		}
		const previousAttemptId = run.terminalId;
		const [previous] = await rows<{ target: DeliveryReceipt }>(
			tx,
			sql`SELECT target FROM agent_start_requests
			WHERE actor_kind='system' AND actor_name='session-observer' AND run_id=${run.id}
			AND target->>'attemptId'=${previousAttemptId}`,
		);
		const resume = previous?.target.providerSessionId === run.sessionId;
		const [rollover] = resume
			? []
			: await rows<{ target: { summaryMessageId: string } }>(
					tx,
					sql`SELECT target FROM agent_start_requests
			WHERE actor_kind='system' AND actor_name='session-observer-rollover' AND run_id=${run.id}
			AND target->>'providerSessionId'=${run.sessionId}`,
				);
		const seed = rollover
			? await readObserverSummaryBody(tx, {
					observerId: input.observerId,
					summaryMessageId: rollover.target.summaryMessageId,
				})
			: undefined;
		const attempt = await reserveAttempt({ ...ctx.core, now: ctx.now() }, tx, { runId: run.id });
		await tx.execute(sql`UPDATE agent_runs SET terminal_id=${attempt.id},closed_at=NULL,error=NULL,
			updated_at=${ctx.now()} WHERE id=${run.id}`);
		await tx.execute(sql`INSERT INTO agent_start_requests
			(request_id,actor_kind,actor_name,run_id,target,created_at)
			VALUES (${requestId},'system','session-observer',${run.id},
			${JSON.stringify({ attemptId: attempt.id, messageId: attempt.id, priorResultId: null, digest, providerSessionId: run.sessionId, throughCursor: input.throughCursor })}::jsonb,${ctx.now()})`);
		return {
			run: { ...run, terminalId: attempt.id },
			replay: false as const,
			attemptId: attempt.id,
			attempt,
			previousAttemptId,
			providerSessionId: run.sessionId,
			resume,
			seed,
		};
	});
}
