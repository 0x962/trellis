import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { ServiceCtx } from "../../support.ts";

export async function observeAttempt(
	ctx: Pick<ServiceCtx, "newTx">,
	input: { runId: string; attemptId: string; sessionId: string | null },
) {
	return ctx.newTx(async (tx) => {
		// startNative can save agent_runs before the runtime reports input.sessionId.
		// terminal_id identifies the attempt that can supply this late session_id.
		const [run] = await rows<{ error: string | null }>(
			tx,
			sql`
			UPDATE agent_runs SET session_id=${input.sessionId}
			WHERE id=${input.runId} AND terminal_id=${input.attemptId}
			AND (session_id IS NULL OR session_id IS NOT DISTINCT FROM ${input.sessionId})
			RETURNING error`,
		);
		return { matched: run !== undefined, error: run?.error ?? null };
	});
}
