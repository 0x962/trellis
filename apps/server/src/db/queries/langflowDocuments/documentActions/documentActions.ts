import type { FlowDocumentV1 } from "@trellis/api";
import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import { protocolDigest } from "../../../../langflowContracts";
import { langflowDocumentActions as actions } from "../../../tables/langflowDocuments/actions";
import type { Tx } from "../../../tx";

export type DocumentActionKey = { flowId: string; requestId: string };
export type DocumentActionRecord = typeof actions.$inferSelect;
export type ClaimDocumentActionInput = DocumentActionKey & {
	action: "publish" | "convert";
	requestBytes: string;
	revision: number;
	createdAt: Date;
};
export type ClaimDocumentActionResult = {
	state: "claimed" | "replayed" | "request_conflict";
	record: DocumentActionRecord;
};
const key = (input: DocumentActionKey) => and(eq(actions.flowId, input.flowId), eq(actions.requestId, input.requestId));

export async function readDocumentAction(tx: Tx, input: DocumentActionKey): Promise<DocumentActionRecord | null> {
	const [row] = await tx.select().from(actions).where(key(input));
	return row ?? null;
}
export async function claimDocumentAction(tx: Tx, input: ClaimDocumentActionInput): Promise<ClaimDocumentActionResult> {
	const [created] = await tx.insert(actions).values({ ...input, requestDigest: protocolDigest(input.requestBytes) })
		.onConflictDoNothing().returning();
	if (created) return { state: "claimed", record: created };
	const record = (await readDocumentAction(tx, input))!;
	const equal = record.action === input.action && record.requestBytes === input.requestBytes && record.revision === input.revision;
	return { state: equal ? "replayed" : "request_conflict", record };
}
export async function completeDocumentAction(
	tx: Tx,
	input: DocumentActionKey & { document: FlowDocumentV1 },
): Promise<FlowDocumentV1> {
	const [row] = await tx.select().from(actions).where(key(input)).for("update");
	if (!row) throw new Error("document_action_not_found");
	if (row.document !== null) {
		if (!isDeepStrictEqual(row.document, input.document)) throw new Error("document_action_receipt_conflict");
		return row.document;
	}
	if (input.document.flow.id !== row.flowId || (row.action === "publish" && input.document.revision !== row.revision))
		throw new Error("document_action_receipt_conflict");
	await tx.update(actions).set({ document: input.document }).where(key(input));
	return input.document;
}
