import { isDeepStrictEqual } from "node:util";
import { sql } from "drizzle-orm";
import type { ClaudeCheckpoint } from "../../agents/nativeHarness/checkpoint.ts";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveTicket, type ServiceCtx, writeActivity } from "../support.ts";

type StoredObservation = {
	snapshot: HarnessSnapshot;
	checkpoint: ClaudeCheckpoint | null;
	result_key: string | null;
	attention_key: string | null;
};
export const reconcileNativeObservation = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: {
		runId: string;
		attemptId: string;
		snapshot: HarnessSnapshot;
		checkpoint?: ClaudeCheckpoint;
		expectedOffset?: number;
		receipts?: string[];
	},
) => {
	const [run] = await rows<{ id: string; kind: string; ticket_id: string | null }>(
		tx,
		sql`SELECT id,kind,ticket_id FROM agent_runs WHERE id=${input.runId} AND terminal_id=${input.attemptId} AND runtime='native' FOR UPDATE`,
	);
	if (!run) return false;
	const [previous] = await rows<StoredObservation>(
		tx,
		sql`SELECT snapshot,checkpoint,result_key,attention_key FROM agent_harness_observations WHERE attempt_id=${input.attemptId}`,
	);
	if (input.expectedOffset !== undefined && (previous?.checkpoint?.offset ?? 0) !== input.expectedOffset) return false;
	const snapshot =
		input.snapshot.state === "unknown" && previous
			? {
					...previous.snapshot,
					...input.snapshot,
					transcript: input.snapshot.transcript.length > 0 ? input.snapshot.transcript : previous.snapshot.transcript,
					result: input.snapshot.result ?? previous.snapshot.result,
					resultId: input.snapshot.resultId ?? previous.snapshot.resultId,
					acknowledgedMessageIds: [
						...new Set([...previous.snapshot.acknowledgedMessageIds, ...input.snapshot.acknowledgedMessageIds]),
					].slice(-128),
				}
			: input.snapshot;
	const resultKey =
		snapshot.state === "idle" && snapshot.result !== null
			? JSON.stringify([snapshot.resultId ?? null, snapshot.acknowledgedMessageIds.at(-1) ?? null, snapshot.result])
			: (previous?.result_key ?? null);
	const attentionKey = ["needs_input", "failed", "unknown"].includes(snapshot.state)
		? JSON.stringify([
				snapshot.state,
				snapshot.acknowledgedMessageIds.at(-1) ?? null,
				snapshot.pendingPermissions.map((permission) => permission.requestId).sort(),
				snapshot.error,
			])
		: (previous?.attention_key ?? null);
	const serialized = JSON.stringify(snapshot);
	const snapshotChanged = !isDeepStrictEqual(previous?.snapshot, JSON.parse(serialized));
	for (const messageId of input.receipts ?? [])
		await tx.execute(
			sql`INSERT INTO agent_harness_receipts (attempt_id,message_id,observed_at) VALUES (${input.attemptId},${messageId},${ctx.now()}) ON CONFLICT DO NOTHING`,
		);
	const checkpoint = input.checkpoint ?? previous?.checkpoint ?? null;
	const changed = await rows<{ attempt_id: string }>(
		tx,
		sql`INSERT INTO agent_harness_observations (attempt_id,snapshot,checkpoint,result_key,attention_key,updated_at)
 VALUES (${input.attemptId},${serialized}::jsonb,${JSON.stringify(checkpoint)}::jsonb,${resultKey},${attentionKey},${ctx.now()})
 ON CONFLICT (attempt_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,checkpoint=EXCLUDED.checkpoint,result_key=EXCLUDED.result_key,attention_key=EXCLUDED.attention_key,updated_at=EXCLUDED.updated_at
 WHERE agent_harness_observations.snapshot IS DISTINCT FROM EXCLUDED.snapshot OR agent_harness_observations.checkpoint IS DISTINCT FROM EXCLUDED.checkpoint
 RETURNING attempt_id`,
	);
	if (changed.length === 0 || !snapshotChanged) return false;
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	if (run.kind === "manager" || run.ticket_id === null) return true;
	const action =
		resultKey !== null && resultKey !== previous?.result_key
			? "agent.turn.completed"
			: attentionKey !== null && attentionKey !== previous?.attention_key
				? `agent.harness.${snapshot.state}`
				: null;
	if (action !== null) {
		const ticket = await resolveTicket(tx, run.ticket_id);
		await writeActivity({ ...ctx, actor: { kind: "system", name: "trellis" } }, tx, {
			ticket,
			action,
			meta: {
				runId: run.id,
				attemptId: input.attemptId,
				state: snapshot.state,
				result: snapshot.result,
				error: snapshot.error,
			},
			at: ctx.now(),
		});
	}
	return true;
};
