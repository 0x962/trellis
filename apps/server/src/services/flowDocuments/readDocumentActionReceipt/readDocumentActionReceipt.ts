import {
	ActivateConversionV1InputSchema,
	ConversionEditIntentV1Schema,
	PublishDocumentV1InputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../../context";
import type { Tx } from "../../../db/tx";
import { documentBytes } from "../documentBytes";
import { type DocumentActionReceiptInput, documentIntentReceipt } from "../documentIntentReceipt";

export const readDocumentActionReceipt = async (ctx: ServiceCtx, tx: Tx, input: DocumentActionReceiptInput) => {
	requireActor(ctx);
	const schemas = {
		publish: PublishDocumentV1InputSchema,
		convert: ActivateConversionV1InputSchema,
		edit: ConversionEditIntentV1Schema,
	};
	const intent = schemas[input.operation].parse(input.value);
	const requestBytes = documentBytes(intent);
	await tx.execute(sql`SELECT id FROM flows WHERE id = ${intent.flowId} FOR UPDATE`);
	return documentIntentReceipt(tx, {
		operation: input.operation,
		flowId: intent.flowId,
		requestId: intent.requestId,
		requestBytes,
	});
};
