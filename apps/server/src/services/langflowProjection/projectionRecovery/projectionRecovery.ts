import type { ServiceCtx } from "../../../context";
import { type ListAuthorityExecutionsInput, listAuthorityExecutions } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";

export async function projectionRecovery(ctx: ServiceCtx, tx: Tx, input: ListAuthorityExecutionsInput) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	return listAuthorityExecutions(tx, input);
}
