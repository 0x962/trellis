import { ORPCError } from "@orpc/server";
import { FlowDocumentSaveV1InputSchema, type FlowDocumentV1 } from "@trellis/api";
import type { EditorIdentity } from "../../../../../../integrations/langflow/editor/protocol";
import { sameEditorIdentity } from "../../../../../../integrations/langflow/editor/protocol";
import { documentBytes } from "../../flowDocuments/documentBytes";
import { assertActive } from "../authorization";
import { currentDocument } from "../currentDocument";
import { editorFailure } from "../failure";
import { scopedDocument } from "../scopedDocument";
import type { EditorGrant, EditorSessionOptions, InstalledEditorManifest } from "../types";

type SaveInput = {
	bytes: Uint8Array;
	identity: EditorIdentity;
	manifest: InstalledEditorManifest;
	value: unknown;
};

export async function commitSave(
	grant: EditorGrant,
	options: EditorSessionOptions,
	request: SaveInput,
	save: () => Promise<FlowDocumentV1>,
) {
	if (grant.busy) throw editorFailure("EDITOR_SAVE_IN_PROGRESS", 409);
	grant.busy = true;
	try {
		assertActive(grant, options);
		const { bytes, identity, manifest } = request;
		const input = FlowDocumentSaveV1InputSchema.parse(request.value);
		if (input.engine !== "langflow" || input.componentManifestHash !== manifest.hash)
			throw editorFailure("MANIFEST_MISMATCH");
		if (input.flow !== identity.flowId) throw editorFailure("FLOW_MISMATCH");
		if (!sameEditorIdentity(identity, grant.session.identity)) throw editorFailure("IDENTITY_MISMATCH");
		await scopedDocument(grant, options);
		assertActive(grant, options);
		const previous = grant.receipts.get(input.requestId);
		if (previous) {
			if (!Buffer.from(previous.bytes).equals(Buffer.from(bytes))) throw editorFailure("FLOW_REQUEST_CONFLICT", 409);
			return previous.response;
		}
		let recovered: FlowDocumentV1 | null = null;
		if (grant.pending !== null) {
			if (grant.pending.requestId !== input.requestId) throw editorFailure("EDITOR_SAVE_IN_PROGRESS", 409);
			if (!Buffer.from(grant.pending.bytes).equals(Buffer.from(bytes)))
				throw editorFailure("FLOW_REQUEST_CONFLICT", 409);
			const durable = await options.documents.receipt(grant.actor, { flow: input.flow, requestId: input.requestId });
			if (durable !== null) {
				if (!documentBytes(input).equals(Buffer.from(durable.requestBytes)))
					throw editorFailure("FLOW_REQUEST_CONFLICT", 409);
				recovered = durable.receipt;
			}
		}
		const content = {
			schemaVersion: 1 as const,
			engine: "langflow" as const,
			graphDocument: input.graphDocument,
			componentManifestHash: input.componentManifestHash,
		};
		if (recovered === null) {
			await currentDocument(grant, options, true);
			if (input.expectedVersion !== grant.revision) throw editorFailure("FLOW_VERSION_CONFLICT", 412);
			await manifest.assertContent(content);
		}
		assertActive(grant, options);
		grant.pending = { requestId: input.requestId, bytes };
		const document = recovered ?? (await save());
		if (
			document.engine !== "langflow" ||
			document.flow.id !== identity.flowId ||
			document.flow.project !== grant.project ||
			document.revision !== input.expectedVersion + 1 ||
			document.flow.version !== document.revision ||
			!documentBytes(content).equals(
				documentBytes({
					schemaVersion: document.schemaVersion,
					engine: document.engine,
					graphDocument: document.graphDocument,
					componentManifestHash: document.componentManifestHash,
				}),
			)
		)
			throw new Error("The committed editor receipt does not identify its save request.");
		const response = JSON.stringify(document);
		grant.receipts.set(input.requestId, { bytes, identity, response });
		grant.pending = null;
		grant.revision = document.revision;
		grant.documentHash = document.documentHash;
		assertActive(grant, options);
		return response;
	} catch (error) {
		if (error instanceof ORPCError && error.code === "FLOW_VERSION_CONFLICT") {
			grant.conflicted = true;
			grant.pending = null;
		}
		throw error;
	} finally {
		grant.busy = false;
	}
}
