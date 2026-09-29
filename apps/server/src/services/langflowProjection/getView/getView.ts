import type { ServiceCtx } from "../../../context.ts";
import { readProjection } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import { fail } from "../../../errors.ts";

export async function getView(_ctx: ServiceCtx, tx: Tx, input: { id: string }) {
	const record = await readProjection(tx, { executionId: input.id });
	if (!record) throw fail("NOT_FOUND", { kind: "flow execution", ref: input.id });
	return record.view;
}
