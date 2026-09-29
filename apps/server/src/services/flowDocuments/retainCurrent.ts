import type { Flow } from "@trellis/api";
import type { ServiceCtx } from "../../context.ts";
import { readDocumentRevision } from "../../db/queries/langflowDocuments";
import type { Tx } from "../../db/tx.ts";
import { captureMetadata } from "./captureMetadata.ts";

export const retainCurrent = async (ctx: ServiceCtx, tx: Tx, flow: Flow) => {
	const stored = await readDocumentRevision(tx, { flowId: flow.id, revision: flow.version });
	if (stored === undefined) await captureMetadata(ctx, tx, flow);
};
