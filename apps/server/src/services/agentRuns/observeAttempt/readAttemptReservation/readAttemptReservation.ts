import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { rows } from "../../../../db/queries/support";
import type { Tx } from "../../../../db/tx";
import { getRun } from "../../queries";

export async function readAttemptReservation(
	_ctx: object,
	tx: Tx,
	input: { runId: string; attemptId: string; token: string },
) {
	const run = await getRun(tx, input.runId);
	const [attempt] = await rows<{ generation: number }>(
		tx,
		sql`SELECT generation FROM agent_execution_attempts
		WHERE id=${input.attemptId} AND run_id=${input.runId}
		AND token_hash=${createHash("sha256").update(input.token).digest("hex")}`,
	);
	if (!attempt || run.terminalId !== input.attemptId || run.closedAt !== null)
		throw new Error("native_attempt_conflict");
	return { run, attempt: { id: input.attemptId, generation: attempt.generation, token: input.token } };
}
