import { ORPCError } from "@orpc/server";
import { type FlowDocumentSaveV1Input, FlowDocumentSaveV1InputSchema, type FlowDocumentV1 } from "@trellis/api";
import { requireActor, type ServiceCtx } from "../../../context.ts";
import {
	readDocumentSaveReceipt,
	readDocumentSaveReceiptsByRef,
	saveDocument,
} from "../../../db/queries/langflowDocuments";
import type { Tx } from "../../../db/tx.ts";
import { fail } from "../../../errors.ts";
import { upsert } from "../../actors.ts";
import { replaceLegacyGraph, resolveFlow } from "../../flows/flows.ts";
import { assertLegacy } from "../assertLegacy";
import { documentBytes } from "../documentBytes";
import { retainCurrent } from "../retainCurrent";

const requestConflict = (requestId: string) =>
	new ORPCError("FLOW_REQUEST_CONFLICT", {
		status: 409,
		message: "This request ID already identifies different save bytes.",
		defined: true,
		data: { requestId },
	});

export const save = async (ctx: ServiceCtx, tx: Tx, value: FlowDocumentSaveV1Input): Promise<FlowDocumentV1> => {
	const actor = requireActor(ctx);
	const input = FlowDocumentSaveV1InputSchema.parse(value);
	const requestBytes = documentBytes(input);
	const byRef = await readDocumentSaveReceiptsByRef(tx, input);
	if (byRef.length > 0) {
		if (byRef.length !== 1 || !byRef[0]!.requestBytes.equals(requestBytes)) throw requestConflict(input.requestId);
		return byRef[0]!.receipt;
	}
	const current = await resolveFlow(tx, input.flow);
	const previous = await readDocumentSaveReceipt(tx, { flowId: current.id, requestId: input.requestId });
	if (previous !== undefined) {
		if (!previous.requestBytes.equals(requestBytes)) throw requestConflict(input.requestId);
		return previous.receipt;
	}
	if (input.engine === "legacy") await assertLegacy(ctx, tx, { flowId: current.id, operation: "write" });
	await retainCurrent(ctx, tx, current);
	const { schemaVersion } = input;
	const content =
		input.engine === "legacy"
			? { schemaVersion, engine: "legacy" as const, graphDocument: input.graphDocument, componentManifestHash: null }
			: {
					schemaVersion,
					engine: "langflow" as const,
					graphDocument: input.graphDocument,
					componentManifestHash: input.componentManifestHash,
				};
	const result = await saveDocument(tx, {
		flowId: current.id,
		expectedVersion: input.expectedVersion,
		requestId: input.requestId,
		requestBytes,
		sourceBytes: documentBytes(content),
		content,
		diagnostics: [],
		savedAt: ctx.now,
	});
	if (result.state === "request_conflict") throw requestConflict(result.requestId);
	if (result.state === "version_conflict") throw fail("FLOW_VERSION_CONFLICT", { version: result.version });
	if (result.state === "saved") {
		if (input.engine === "legacy")
			await replaceLegacyGraph(ctx, tx, {
				current,
				graph: { flow: current.id, ...input.graphDocument },
			});
		await upsert(ctx, tx, actor);
		ctx.emit({ type: "flows.changed", id: current.id });
	}
	return result.receipt;
};
