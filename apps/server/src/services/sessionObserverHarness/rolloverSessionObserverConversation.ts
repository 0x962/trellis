import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import { getRun } from "../agentRuns/queries.ts";
import { readSessionObserverSummaryForClaim } from "../sessionObservers/index.ts";
import { sessionOperation } from "../sessions/operation.ts";
import type { IoCtx } from "../support.ts";
import { recoverSessionObserverAttempt } from "./recoverSessionObserverAttempt.ts";
import { ObserverHarnessError } from "./types.ts";

export async function rolloverSessionObserverConversation(
	ctx: IoCtx,
	input: {
		sourceRunId: string;
		observerRunId: string;
		claimId: string;
		expectedProviderSessionId: string;
		summaryMessageId: string;
	},
	deps = { recover: recoverSessionObserverAttempt },
): Promise<{ providerSessionId: string }> {
	return sessionOperation(ctx.home, input.observerRunId, async () => {
		await deps.recover(ctx, { observerRunId: input.observerRunId });
		return ctx.newTx(async (tx) => {
			const summary = await readSessionObserverSummaryForClaim(tx, { ...input, runId: input.sourceRunId });
			if (!summary)
				throw new ObserverHarnessError(
					"OBSERVER_DISABLED",
					"Save the summary under the active observer claim before a new conversation.",
				);
			const requestId = `observer-rollover:${input.observerRunId}:${summary.id}`;
			const [receipt] = await rows<{ target: { providerSessionId: string; priorProviderSessionId: string } }>(
				tx,
				sql`SELECT target FROM agent_start_requests WHERE actor_kind='system'
				AND actor_name='session-observer-rollover' AND request_id=${requestId}`,
			);
			const run = await getRun(tx, input.observerRunId);
			if (
				receipt &&
				receipt.target.priorProviderSessionId === input.expectedProviderSessionId &&
				run.sessionId === receipt.target.providerSessionId
			)
				return { providerSessionId: receipt.target.providerSessionId };
			if (run.sessionId !== input.expectedProviderSessionId || receipt)
				throw new ObserverHarnessError(
					"OBSERVER_CONVERSATION_LOST",
					"The saved observer conversation changed. Read its current identity before rollover.",
				);
			const providerSessionId = randomUUID();
			await tx.execute(sql`INSERT INTO agent_start_requests (request_id,actor_kind,actor_name,run_id,target,created_at)
				VALUES (${requestId},'system','session-observer-rollover',${run.id},
				${JSON.stringify({ providerSessionId, priorProviderSessionId: run.sessionId, priorAttemptId: run.terminalId, summaryMessageId: summary.id })}::jsonb,${ctx.now()})`);
			const changed = await rows(
				tx,
				sql`UPDATE agent_runs SET session_id=${providerSessionId},updated_at=${ctx.now()}
				WHERE id=${run.id} AND session_id=${input.expectedProviderSessionId} RETURNING id`,
			);
			if (changed.length !== 1)
				throw new ObserverHarnessError(
					"OBSERVER_CONVERSATION_LOST",
					"The saved observer conversation changed during rollover.",
				);
			return { providerSessionId };
		});
	});
}
