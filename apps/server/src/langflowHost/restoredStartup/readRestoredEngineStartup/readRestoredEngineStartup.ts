import { isDeepStrictEqual } from "node:util";
import { assertHomeLock } from "../../../homeLock";
import { readEngineReceipt } from "../../restoredEngine/components/receipt";
import { RestoredEngineInputSchema } from "../../restoredEngine/contracts";
import { assertStartupClosed, restoredStartupContext, restoreStartupRequired } from "../components/context";
import type { ReadRestoredEngineStartupInput, RestoredEngineStartup } from "../contracts";

export function readRestoredEngineStartup(input: ReadRestoredEngineStartupInput): RestoredEngineStartup | undefined {
	assertHomeLock(input.homeLock, input.home);
	input.signal.throwIfAborted();
	if (!restoreStartupRequired(input.home)) {
		if (input.receiptId !== null) throw new Error("restored_startup_block_missing");
		return undefined;
	}
	if (input.receiptId === null) throw new Error("restored_startup_receipt_required");
	const ctx = restoredStartupContext(input.home);
	const block = ctx.store.read().block;
	const parsed = RestoredEngineInputSchema.parse({ hostId: ctx.identity.hostId, dataHomeId: ctx.identity.dataHomeId,
		home: ctx.identity.home, block, qualification: input.qualification });
	assertStartupClosed(ctx, parsed);
	const receipt = readEngineReceipt({ ...ctx, assertClosed: async () => assertStartupClosed(ctx, parsed) }, input.receiptId);
	if (!isDeepStrictEqual(receipt.record.intent.block, block)) throw new Error("restored_startup_receipt_block_conflict");
	return { input: parsed, receiptId: input.receiptId, homeLock: input.homeLock, signal: input.signal };
}
