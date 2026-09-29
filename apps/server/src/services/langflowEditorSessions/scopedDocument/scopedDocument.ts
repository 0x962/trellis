import { editorFailure } from "../failure";
import type { EditorDocument, EditorGrant, EditorSessionOptions } from "../types";

export async function scopedDocument(grant: EditorGrant, options: EditorSessionOptions): Promise<EditorDocument> {
	const { document, projectId } = await options.documents.get(grant.actor, { flow: grant.session.identity.flowId });
	if (document.flow.id !== grant.session.identity.flowId) throw editorFailure("FLOW_MISMATCH");
	if (projectId !== grant.projectId) throw editorFailure("PROJECT_MISMATCH");
	if (document.engine !== "langflow" || document.componentManifestHash !== grant.session.identity.componentManifestHash)
		throw editorFailure("MANIFEST_MISMATCH");
	return document;
}
