import type { DispatchGate, DispatchReceiptArchive } from "../../../langflowHost";
import type { IoCtx } from "../../support";
import { readNativeDispatchEvidence } from "../readNativeDispatchEvidence";

export function createNativeDispatchGate(ctx: Pick<IoCtx, "newTx"> & {
	dataHomeId: string;
	gate: Pick<DispatchGate, "acquire" | "settle">;
	archive: Pick<DispatchReceiptArchive, "writeTerminal">;
}): Pick<DispatchGate, "acquire" | "settle"> {
	return {
		acquire: (binding) => ctx.gate.acquire(binding),
		async settle(permit, receiptId) {
			const evidence = await ctx.newTx((tx) => readNativeDispatchEvidence(ctx, tx, { permit, receiptId }));
			if (!evidence) throw new Error("native_dispatch_evidence_unknown");
			const terminal = ctx.archive.writeTerminal({ permit, ...evidence });
			await ctx.gate.settle(permit, terminal.id);
		},
	};
}
