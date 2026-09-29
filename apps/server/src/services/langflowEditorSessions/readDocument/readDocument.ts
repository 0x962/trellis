import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { get } from "../../flowDocuments";
import { flowProjectIdOf } from "../../flows/flows.ts";
import type { EditorDocumentRead } from "../types";

export async function readDocument(ctx: ServiceCtx, tx: Tx, input: { flow: string }): Promise<EditorDocumentRead> {
	const document = await get(ctx, tx, input);
	const projectId = await flowProjectIdOf(tx, document.flow.id);
	return { document, projectId };
}
