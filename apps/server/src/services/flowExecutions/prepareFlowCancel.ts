import type { FlowExecutionCancelInput } from "@trellis/api";
import { invalidInput } from "../../errors.ts";
import { stopNative } from "../agentRuns/nativeLifecycle.ts";
import { cancel } from "./cancel.ts";
import { drainFlowStops } from "./drainFlowStops.ts";
import { get } from "./queries.ts";
import type { FlowCtx } from "./types.ts";
export async function prepareFlowCancel(ctx: FlowCtx, input: FlowExecutionCancelInput, stop = stopNative) {
	await ctx.newTx((tx) => cancel(ctx.core, tx, input));
	const errors = await drainFlowStops(ctx, input.id, stop);
	if (errors.length > 0) throw invalidInput("runtime", errors.join("\n"));
	return ctx.newTx((tx) => get(ctx.core, tx, input));
}
