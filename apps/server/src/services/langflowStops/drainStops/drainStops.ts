import type { HarnessHost } from "../../../agents/harnessHost/harnessHost.ts";
import { nativeHost } from "../../../agents/native/harnessHost.ts";
import { lockExecution, readProjectionFacts, updateStop } from "../../../db/queries/langflowExecution";
import type { IoCtx } from "../../support.ts";
import { stopAttempt } from "../stopAttempt";

export async function drainStops(
	ctx: Pick<IoCtx, "newTx" | "home" | "now" | "emit" | "log">,
	input: { executionId: string },
	host: Pick<HarnessHost, "stop"> = nativeHost(ctx.home),
) {
	const facts = await ctx.newTx((tx) => readProjectionFacts(tx, input));
	for (const stop of facts.stops) {
		if (stop.state === "confirmed") continue;
		const observed = await stopAttempt(host, stop, ctx.now);
		await ctx.newTx(async (tx) => {
			const execution = await lockExecution(tx, input);
			const current = (await readProjectionFacts(tx, input)).stops.find(
				(row) => row.obligationId === stop.obligationId,
			)!;
			if (current.state === "confirmed") return;
			await updateStop(tx, {
				expectedRevision: current.revision,
				obligation: { ...observed.obligation, revision: current.revision + 1 },
			});
			ctx.emit({ type: "flows.changed", id: execution.flowId });
		});
		if (observed.error !== null)
			ctx.log("Langflow native stop remains unconfirmed", {
				executionId: input.executionId,
				attemptId: stop.attemptId,
				error: observed.error,
			});
	}
	const current = await ctx.newTx((tx) => readProjectionFacts(tx, input));
	return { needsStop: current.stops.some((stop) => stop.state !== "confirmed"), stops: current.stops };
}
