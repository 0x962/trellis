import type { ServiceCtx } from "../../context.ts";
import { readLatestDocumentRevision } from "../../db/queries/langflowDocuments";
import type { Tx } from "../../db/tx.ts";
import { unsupported } from "./unsupported.ts";

export const assertLegacy = async (
	_ctx: ServiceCtx,
	tx: Tx,
	input: { flowId: string; operation: "read" | "write" },
) => {
	const latest = await readLatestDocumentRevision(tx, { flowId: input.flowId });
	if (latest?.snapshot.engine === "langflow") throw unsupported(latest.snapshot, input.operation);
};
