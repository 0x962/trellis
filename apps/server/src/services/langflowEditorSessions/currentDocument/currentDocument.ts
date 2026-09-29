import { editorFailure } from "../failure";
import { scopedDocument } from "../scopedDocument";
import type { EditorDocument, EditorGrant, EditorSessionOptions } from "../types";

export async function currentDocument(
	grant: EditorGrant,
	options: EditorSessionOptions,
	saving = false,
): Promise<EditorDocument> {
	const revision = grant.revision;
	const document = await scopedDocument(grant, options);
	if (!saving && (grant.busy || grant.pending !== null || grant.revision !== revision))
		throw editorFailure("EDITOR_SAVE_IN_PROGRESS", 409);
	if (document.revision !== grant.revision || document.documentHash !== grant.documentHash) {
		grant.conflicted = true;
		throw editorFailure("FLOW_VERSION_CONFLICT", 412);
	}
	if (grant.conflicted) throw editorFailure("FLOW_VERSION_CONFLICT", 412);
	return document;
}
