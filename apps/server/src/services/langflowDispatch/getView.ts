import type { ServiceCtx } from "../../context.ts";
import { readExecution } from "../../db/queries/langflowExecution";
import type { Tx } from "../../db/tx.ts";
import { getView as langflowView } from "../langflowProjection/getView.ts";
import { getView as legacyView } from "../legacyFlowHistory/getView.ts";

export async function getView(ctx: ServiceCtx, tx: Tx, input: { id: string }) {
	const execution = await readExecution(tx, { executionId: input.id });
	return execution === null ? legacyView(ctx, tx, input) : langflowView(ctx, tx, input);
}
