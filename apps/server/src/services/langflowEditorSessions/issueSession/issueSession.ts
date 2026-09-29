import { randomBytes } from "node:crypto";
import { EditorSessionSchema } from "../../../../../../integrations/langflow/editor/session";
import { tokenHash } from "../authorization";
import { editorFailure } from "../failure";
import type { EditorGrant, EditorSessionIssueInput, EditorSessionIssueResult, EditorSessionOptions } from "../types";

export async function issueSession(
	grants: Map<string, EditorGrant>,
	options: EditorSessionOptions,
	input: EditorSessionIssueInput,
): Promise<EditorSessionIssueResult> {
	const actor = await options.actor();
	if (actor.kind !== "human") throw editorFailure("ACTOR_MISMATCH");
	const { document, projectId } = await options.documents.get(actor, { flow: input.flow });
	if (document.engine !== "langflow") throw editorFailure("FLOW_UNSUPPORTED_FORMAT", 409);
	if (document.revision !== input.expectedVersion) throw editorFailure("FLOW_VERSION_CONFLICT", 412);
	const manifest = await options.installedManifest();
	if (manifest.hash !== document.componentManifestHash) throw editorFailure("MANIFEST_MISMATCH");
	const content = {
		schemaVersion: 1 as const,
		engine: "langflow" as const,
		graphDocument: document.graphDocument,
		componentManifestHash: document.componentManifestHash,
	};
	await manifest.assertContent(content);
	const now = options.now();
	const expiry = options.expiresAt(now);
	if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now.getTime())
		throw new Error("The editor policy must supply a future expiry.");
	for (const [channel, grant] of grants) {
		if (grant.revoked || Date.parse(grant.session.expiresAt) <= now.getTime()) grants.delete(channel);
	}
	const session = EditorSessionSchema.parse({
		channel: crypto.randomUUID(),
		identity: {
			host: options.hostId,
			actor: `${actor.kind}:${actor.name}`,
			flowId: document.flow.id,
			revision: document.revision,
			documentHash: document.documentHash,
			componentManifestHash: manifest.hash,
		},
		content,
		editorOrigin: options.editorOrigin,
		expiresAt: expiry.toISOString(),
	});
	const token = randomBytes(32).toString("base64url");
	grants.set(session.channel, {
		session,
		actor,
		projectId,
		project: document.flow.project,
		revision: document.revision,
		documentHash: document.documentHash,
		tokenHash: tokenHash(token),
		revoked: false,
		conflicted: false,
		busy: false,
		pending: null,
		receipts: new Map(),
	});
	return { session, credential: { token, expiresAt: expiry } };
}
