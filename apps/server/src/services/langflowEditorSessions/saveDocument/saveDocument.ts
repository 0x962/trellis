import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { fail } from "../../../errors.ts";
import { save } from "../../flowDocuments";
import { editorFailure } from "../failure";
import { readDocument } from "../readDocument";
import type { EditorDocumentSave } from "../types";

export async function saveDocument(ctx: ServiceCtx, tx: Tx, input: EditorDocumentSave) {
	const current = await readDocument(ctx, tx, { flow: input.document.flow });
	if (current.projectId !== input.projectId) throw editorFailure("PROJECT_MISMATCH");
	if (
		input.document.engine !== "langflow" ||
		current.document.engine !== "langflow" ||
		current.document.componentManifestHash !== input.document.componentManifestHash
	)
		throw editorFailure("MANIFEST_MISMATCH");
	if (current.document.revision !== input.document.expectedVersion)
		throw fail("FLOW_VERSION_CONFLICT", { version: current.document.revision });
	return save(ctx, tx, input.document);
}
