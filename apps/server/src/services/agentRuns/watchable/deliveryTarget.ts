import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export async function deliveryTarget(_ctx: ServiceCtx, tx: Tx, input: { id: string }) {
	const [target] = await rows<{ terminalId: string; sessionId: string | null }>(
		tx,
		sql`SELECT terminal_id AS "terminalId", session_id AS "sessionId" FROM agent_runs
		WHERE id = ${input.id} AND closed_at IS NULL AND terminal_id IS NOT NULL`,
	);
	return target ?? null;
}
