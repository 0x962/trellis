import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { hasNativeReceipt } from "../agentRuns/nativeReceipt.ts";
import { dispatchMessageId } from "./messageId.ts";
import type { ControllerCtx } from "./types.ts";

export const reconcile = async (ctx: ControllerCtx, tx: Tx) => {
	const unknown = await rows<{ id: string; generation: number; terminalId: string }>(
		tx,
		sql`SELECT id,generation,terminal_id AS "terminalId" FROM manager_dispatches WHERE state='unknown' AND terminal_id IS NOT NULL`,
	);
	for (const delivery of unknown) {
		if (!(await hasNativeReceipt(tx, delivery.terminalId, dispatchMessageId(delivery)))) continue;
		await tx.execute(sql`UPDATE manager_dispatches SET state='sent',error=NULL,updated_at=${ctx.now}
			WHERE id=${delivery.id} AND generation=${delivery.generation} AND terminal_id=${delivery.terminalId} AND state='unknown'`);
	}
	return {};
};
