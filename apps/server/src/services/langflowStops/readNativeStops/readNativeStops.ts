import type { ServiceCtx } from "../../../context";
import { lockExecution, readProjectionFacts } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";

export async function readNativeStops(ctx: ServiceCtx, tx: Tx, input: { executionId: string }) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	await lockExecution(tx, input);
	return (await readProjectionFacts(tx, input)).stops;
}
