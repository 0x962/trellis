import { sql } from "drizzle-orm";
import { rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export type DeliveryTarget = { runId: string; terminalId: string; sessionId: string | null };

export const deliveryTarget = async (
	tx: Tx,
	input: { ticketId: string; terminals: readonly string[] },
): Promise<DeliveryTarget | null> => {
	const [run] = await rows<DeliveryTarget>(
		tx,
		sql`SELECT id AS "runId", terminal_id AS "terminalId", session_id AS "sessionId"
		FROM agent_runs
		WHERE ticket_id=${input.ticketId} AND kind='agent' AND closed_at IS NULL AND runtime='native'
			AND terminal_id = ANY(${textArray(input.terminals)})
		ORDER BY created_at DESC, id DESC
		LIMIT 1`,
	);
	return run ?? null;
};
