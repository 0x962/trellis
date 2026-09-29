import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../../langflowContracts";
import { closed, context } from "../components/context";
import { OpenedDatabaseRecordSchema } from "../components/schema";

export function readRestoredDatabaseOpen(input: { home: string; bootId: string; receiptId: string }) {
	const ctx = context(input.home);
	const sourceBytes = ctx.objects.read(input.receiptId);
	const record = OpenedDatabaseRecordSchema.parse(JSON.parse(sourceBytes));
	if (
		ctx.objects.readBinding(JSON.stringify(["opened", input.bootId])) !== input.receiptId ||
		record.verified.bootId !== input.bootId ||
		!isDeepStrictEqual(record.verified.identity, ctx.identity) ||
		ctx.objects.readBinding("installation") !== record.verified.installReceiptId
	)
		throw new Error("restored_database_open_receipt_conflict");
	closed(ctx, record.verified.block);
	return { record, sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
}
