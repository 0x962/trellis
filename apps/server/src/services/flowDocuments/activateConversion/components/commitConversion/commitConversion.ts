import { isDeepStrictEqual } from "node:util";
import type { ActivateConversionV1Input } from "@trellis/api";
import { requireActor, type ServiceCtx } from "../../../../../context";
import { saveDocument } from "../../../../../db/queries/langflowDocuments";
import type { Tx } from "../../../../../db/tx";
import { upsert } from "../../../../actors";
import { documentBytes } from "../../../documentBytes";
import type { PreparedDocumentConversion } from "../../../prepareDocumentConversion";
import { captureConversion } from "../captureConversion/captureConversion";

export const commitConversion = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: ActivateConversionV1Input,
	requestBytes: Buffer,
	prepared: PreparedDocumentConversion,
	checkInstalled: () => void,
) => {
	const current = await captureConversion(ctx, tx, input, requestBytes);
	if (current.state === "replayed") return current.document;
	checkInstalled();
	if (!isDeepStrictEqual(current.base.snapshot, prepared.base.snapshot) ||
		!current.base.sourceBytes.equals(prepared.base.sourceBytes) ||
		prepared.content.componentManifestHash !== input.componentManifestHash ||
		!prepared.sourceBytes.equals(documentBytes(prepared.content)) ||
		!prepared.originalSourceBytes.equals(documentBytes({ flow: current.base.snapshot.flow, ...current.base.snapshot.graphDocument })))
		throw new Error("conversion_preparation_conflict");
	const result = await saveDocument(tx, {
		flowId: input.flowId, expectedVersion: input.expectedVersion, requestId: input.requestId,
		requestBytes, sourceBytes: prepared.sourceBytes, content: prepared.content,
		diagnostics: prepared.diagnostics, savedAt: ctx.now,
	});
	if (result.state !== "saved") throw new Error("conversion_commit_conflict");
	await upsert(ctx, tx, requireActor(ctx));
	ctx.emit({ type: "flows.changed", id: input.flowId });
	return result.receipt;
};
