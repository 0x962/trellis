import type { ServiceCtx } from "../../../context.ts";
import { readDocumentSaveReceipt } from "../../../db/queries/langflowDocuments";
import type { Tx } from "../../../db/tx.ts";
import { resolveFlow } from "../../flows/flows.ts";

export async function readSaveReceipt(_ctx: ServiceCtx, tx: Tx, input: { flow: string; requestId: string }) {
	const flow = await resolveFlow(tx, input.flow);
	const saved = await readDocumentSaveReceipt(tx, { flowId: flow.id, requestId: input.requestId });
	return saved === undefined ? null : { requestBytes: saved.requestBytes.toString("utf8"), receipt: saved.receipt };
}
