import { isDeepStrictEqual } from "node:util";
import { sql } from "drizzle-orm";
import type { FlowExecution } from "../../agents/nativeFlow/types.ts";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import type { StoredExecution } from "./types.ts";
export async function saveState(ctx: ServiceCtx, tx: Tx, previous: StoredExecution, state: FlowExecution) {
	if (isDeepStrictEqual({ ...previous.state, updatedAt: 0 }, { ...state, updatedAt: 0 })) return false;
	await tx.execute(
		sql`UPDATE flow_executions SET state=${JSON.stringify(state)}::jsonb,revision=revision+1,updated_at=${ctx.now} WHERE id=${previous.id}`,
	);
	ctx.emit({ type: "flows.changed", id: previous.flow_id });
	return true;
}
