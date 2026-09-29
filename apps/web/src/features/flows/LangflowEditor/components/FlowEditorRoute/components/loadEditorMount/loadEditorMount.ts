import type { TrellisClient } from "@trellis/api";

export type CurrentEditorIdentity = { host: string | null; actor: string | null };

export async function loadEditorMount(
	api: Pick<TrellisClient["flowDocumentsV1"], "get" | "editorSession">,
	flow: string,
	currentIdentity: () => CurrentEditorIdentity,
) {
	const identity = currentIdentity();
	if (identity.host === null || identity.actor === null) throw new Error("The editor host or actor is unavailable.");
	const document = await api.get({ flow });
	if (document.engine !== "langflow") throw new Error("This document requires a different editor. Reload the flow.");
	const current = currentIdentity();
	if (current.host !== identity.host || current.actor !== identity.actor)
		throw new Error("The editor identity changed.");
	const session = await api.editorSession({ flow: document.flow.id, expectedVersion: document.revision });
	const after = currentIdentity();
	if (
		after.host !== identity.host ||
		after.actor !== identity.actor ||
		session.identity.host !== identity.host ||
		session.identity.actor !== identity.actor ||
		session.identity.flowId !== document.flow.id ||
		session.identity.revision !== document.revision ||
		session.identity.documentHash !== document.documentHash ||
		session.identity.componentManifestHash !== document.componentManifestHash
	)
		throw new Error("The editor grant does not match the current document and identity.");
	return { document, session };
}
