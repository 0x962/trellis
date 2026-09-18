import { AgentSeenInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import type { IoCtx } from "../support.ts";
import { observeRuns } from "./liveState.ts";
import { getRun } from "./queries.ts";

export async function prepareSeen(ctx: IoCtx, value: unknown) {
	const input = AgentSeenInputSchema.parse(value);
	const stored = await ctx.newTx((tx) => getRun(tx, input.id));
	const [run] = await observeRuns(ctx, [stored]);
	if (run!.terminalId !== input.attemptId || run!.observation?.attention?.completion?.sequence !== input.sequence)
		throw fail("SESSION_ATTENTION_CHANGED", { reason: "The completed turn changed." });
	return input;
}

export async function seen(ctx: IoCtx, tx: Tx, value: unknown) {
	const input = AgentSeenInputSchema.parse(value);
	const updated = await rows<{ id: string }>(
		tx,
		sql`
		UPDATE agent_runs SET seen_attempt_id = ${input.attemptId},
		seen_sequence = CASE WHEN seen_attempt_id = ${input.attemptId} THEN greatest(seen_sequence, ${input.sequence}) ELSE ${input.sequence} END
		WHERE id = ${input.id} AND terminal_id = ${input.attemptId} RETURNING id`,
	);
	if (!updated.length) throw fail("SESSION_ATTENTION_CHANGED", { reason: "The session attempt changed." });
	ctx.emit({ type: "agent-runs.changed", id: input.id });
	return { id: input.id };
}
