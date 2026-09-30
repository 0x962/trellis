import type { RuntimeCaptureProducer, RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { Tx } from "../../../db/tx";
import type { IoCtx } from "../../support";

export function withCaptureTransaction<T>(
	ctx: Pick<IoCtx, "newTx"> & { runtime: Pick<RuntimeClient, "withCaptureSnapshot"> },
	request: RuntimeCaptureRequest,
	consume: (tx: Tx, capture: RuntimeCaptureProducer) => Promise<T>,
) {
	return ctx.runtime.withCaptureSnapshot(request, async (capture) => {
		capture.signal.throwIfAborted();
		const result = await ctx.newTx(async (tx) => {
			capture.signal.throwIfAborted();
			const value = await consume(tx, capture);
			capture.signal.throwIfAborted();
			return value;
		});
		capture.signal.throwIfAborted();
		return result;
	});
}
