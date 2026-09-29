import { editorFailure } from "../failure";
import type { EditorDocument, EditorGrant, EditorSessionOptions } from "../types";

export async function currentDocument(
	grant: EditorGrant,
	options: EditorSessionOptions,
	saving = false,
): Promise<EditorDocument> {
	const revision = grant.revision;
	const { document, projectId } = await options.documents.get(grant.actor, { flow: grant.session.identity.flowId });
	if (!saving && (grant.busy || grant.revision !== revision)) throw editorFailure("EDITOR_SAVE_IN_PROGRESS", 409);
	if (document.flow.id !== grant.session.identity.flowId) throw editorFailure("FLOW_MISMATCH");
	if (projectId !== grant.projectId) throw editorFailure("PROJECT_MISMATCH");
	if (document.engine !== "langflow" || document.componentManifestHash !== grant.session.identity.componentManifestHash)
		throw editorFailure("MANIFEST_MISMATCH");
	if (document.revision !== grant.revision || document.documentHash !== grant.documentHash) {
		grant.conflicted = true;
		throw editorFailure("FLOW_VERSION_CONFLICT", 412);
	}
	if (grant.conflicted) throw editorFailure("FLOW_VERSION_CONFLICT", 412);
	return document;
}
