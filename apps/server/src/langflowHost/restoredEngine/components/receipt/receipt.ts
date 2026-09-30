import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../../../langflowContracts";
import { RestoredEngineReceiptSchema, type RestoredEngineResult } from "../../contracts";
import type { InstallContext } from "../context";

export function readEngineReceipt(ctx: InstallContext, receiptId: string): RestoredEngineResult {
	if (ctx.objects.readBinding("installation") !== receiptId)
		throw new Error("restored_engine_receipt_conflict");
	const sourceBytes = ctx.objects.read(receiptId);
	const record = RestoredEngineReceiptSchema.parse(JSON.parse(sourceBytes));
	if (!isDeepStrictEqual(record.intent.identity, ctx.identity) ||
		ctx.objects.readBinding("intent") !== record.destination.intentDigest ||
		!isDeepStrictEqual(JSON.parse(ctx.objects.read(record.destination.intentDigest)), record.intent))
		throw new Error("restored_engine_receipt_identity_conflict");
	return { receiptId, sourceBytes, sourceDigest: protocolDigest(sourceBytes), record };
}
