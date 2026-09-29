import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { getRun } from "../agentRuns/queries.ts";
import { reserveAttempt } from "../assignments/attempts.ts";
import type { IoCtx } from "../support.ts";
import { ObserverHarnessError, SESSION_OBSERVER_MODEL, type SessionObserverReplyInput } from "./types.ts";

type DeliveryReceipt = { attemptId: string; digest: string; providerSessionId: string; throughCursor: string };
const inputDigest = (input: SessionObserverReplyInput) =>
	createHash("sha256")
		.update(JSON.stringify([input.instruction, input.userContext]))
		.digest("hex");
const requestIdOf = (input: SessionObserverReplyInput) =>
	`observer:${input.observerId}:${input.claimId}:${input.deliveryId ?? input.claimId}`;

export async function observerDeliveryReceipt(
	tx: Tx,
	input: SessionObserverReplyInput,
): Promise<DeliveryReceipt | null> {
	const [exact] = await rows<{ target: DeliveryReceipt }>(
		tx,
		sql`SELECT target FROM agent_start_requests
		WHERE actor_kind='system' AND actor_name='session-observer' AND request_id=${requestIdOf(input)}`,
	);
	if (exact) {
		if (exact.target.digest !== inputDigest(input))
			throw new ObserverHarnessError(
				"OBSERVER_DELIVERY_UNKNOWN",
				"This observer delivery ID already has different context.",
			);
		return exact.target;
	}
	const [latest] = await rows<{ target: DeliveryReceipt }>(
		tx,
		sql`SELECT r.target FROM agent_start_requests r
		JOIN agent_execution_attempts a ON a.id=r.target->>'attemptId'
		JOIN agent_runs g ON g.id=r.run_id
		WHERE r.actor_kind='system' AND r.actor_name='session-observer' AND r.run_id=${input.observerRunId}
		AND r.target->>'digest'=${inputDigest(input)} AND r.target->>'throughCursor'=${input.throughCursor}
		AND r.target->>'providerSessionId'=g.session_id
		ORDER BY a.generation DESC LIMIT 1`,
	);
	return latest?.target ?? null;
}

export async function observerClaimIsActive(tx: Tx, input: SessionObserverReplyInput) {
	const [observer] = await rows(
		tx,
		sql`SELECT observer_id FROM session_observers
		WHERE observer_id=${input.observerId} AND run_id=${input.sourceRunId}
		AND observer_run_id=${input.observerRunId} AND enabled
		AND generation_cursor=${input.throughCursor}
		AND generation_state='generating' AND generation_claim_id=${input.claimId} FOR UPDATE`,
	);
	return observer !== undefined;
}

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
		const [seed] = resume
			? []
			: await rows<{ body: string }>(
					tx,
					sql`SELECT m.body FROM agent_start_requests r
			JOIN session_observer_messages m ON m.id=r.target->>'summaryMessageId'
			WHERE r.actor_kind='system' AND r.actor_name='session-observer-rollover' AND r.run_id=${run.id}
			AND r.target->>'providerSessionId'=${run.sessionId}`,
				);
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
			seed: seed?.body,
		};
	});
}
