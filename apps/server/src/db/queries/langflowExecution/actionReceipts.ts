import { isDeepStrictEqual } from "node:util";
import { eq, or } from "drizzle-orm";
import { protocolDigest } from "../../../langflowContracts";
import type { DispatchPermit } from "../../../langflowHost/dispatchGate";
import { langflowActionReceipts } from "../../tables/langflowExecution";
import type { Tx } from "../../tx";

export type ActionReceiptInput = {
	permit: DispatchPermit;
	requestBytes: string;
	requestDigest: string;
	receiptId: string;
	recordedAt: string;
	sourceBytes: string;
} & (
	| { outcome: "completed"; executionId: string; viewRevision: number; errorCode: null; errorBytes: null }
	| { outcome: "refused"; executionId: null; viewRevision: null; errorCode: string; errorBytes: string }
);
export async function readActionReceipt(tx: Tx, input: { permitId: string }) {
	const [row] = await tx
		.select()
		.from(langflowActionReceipts)
		.where(eq(langflowActionReceipts.permitId, input.permitId));
	return row ?? null;
}
export async function saveActionReceipt(tx: Tx, input: ActionReceiptInput) {
	const { sourceBytes, ...fields } = input;
	if (
		!isDeepStrictEqual(JSON.parse(sourceBytes), { version: 1, ...fields }) ||
		protocolDigest(input.requestBytes) !== input.requestDigest
	)
		throw new Error("action_receipt_bytes_conflict");
	const [inserted] = await tx
		.insert(langflowActionReceipts)
		.values({
			...fields,
			permitId: input.permit.id,
			effectId: input.permit.binding.effectId,
			recordedAt: new Date(input.recordedAt),
			sourceBytes,
			sourceDigest: protocolDigest(sourceBytes),
		})
		.onConflictDoNothing()
		.returning();
	if (inserted) return inserted;
	const [existing] = await tx
		.select()
		.from(langflowActionReceipts)
		.where(
			or(
				eq(langflowActionReceipts.permitId, input.permit.id),
				eq(langflowActionReceipts.effectId, input.permit.binding.effectId),
			),
		);
	if (!existing || existing.sourceBytes !== sourceBytes) throw new Error("action_receipt_identity_conflict");
	return existing;
}
