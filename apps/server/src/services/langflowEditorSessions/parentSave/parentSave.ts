import type { FlowDocumentV1 } from "@trellis/api";
import { assertActive } from "../authorization";
import { commitSave } from "../commitSave";
import { editorFailure } from "../failure";
import type { EditorGrant, EditorParentSave, EditorSessionOptions } from "../types";

export async function parentSave(
	grants: Map<string, EditorGrant>,
	options: EditorSessionOptions,
	request: EditorParentSave,
	save: () => Promise<FlowDocumentV1>,
): Promise<FlowDocumentV1> {
	const grant = grants.get(request.channel);
	if (!grant) throw editorFailure("EDITOR_SESSION_REQUIRED", 401);
	assertActive(grant, options);
	const actor = await options.actor();
	if (
		request.actor.kind !== grant.actor.kind ||
		request.actor.name !== grant.actor.name ||
		actor.kind !== grant.actor.kind ||
		actor.name !== grant.actor.name
	)
		throw editorFailure("ACTOR_MISMATCH");
	const manifest = await options.installedManifest();
	if (manifest.hash !== grant.session.identity.componentManifestHash) throw editorFailure("MANIFEST_MISMATCH");
	const bytes = Buffer.from(JSON.stringify(request.input));
	return JSON.parse(
		await commitSave(grant, options, { bytes, identity: grant.session.identity, manifest, value: request.input }, save),
	);
}
