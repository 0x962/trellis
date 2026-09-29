import type { HarnessHost } from "../../../agents/harnessHost/harnessHost.ts";
import { nativeHost } from "../../../agents/native/harnessHost.ts";
import { lockExecution, readProjectionFacts, updateStop } from "../../../db/queries/langflowExecution";
import { saveStopState } from "../../langflowProjection";
import type { IoCtx } from "../../support.ts";
import { stopAttempt } from "../stopAttempt";
import { withAttemptOperation } from "../withAttemptOperation";

export async function drainStops(
	ctx: Pick<IoCtx, "newTx" | "home" | "now" | "core" | "emit" | "log">,
	input: { executionId: string },
	host: Pick<HarnessHost, "stop"> = nativeHost(ctx.home),
) {
	const facts = await ctx.newTx((tx) => readProjectionFacts(tx, input));
	for (const stop of facts.stops) {
		if (stop.state === "confirmed") continue;
		await withAttemptOperation(ctx.home, stop.attemptId, async () => {
			const saved = (await ctx.newTx((tx) => readProjectionFacts(tx, input))).stops.find(
				(row) => row.obligationId === stop.obligationId,
			)!;
			if (saved.state === "confirmed") return;
			const observed = await stopAttempt(host, saved, ctx.now);
			await ctx.newTx(async (tx) => {
				await lockExecution(tx, input);
				const current = (await readProjectionFacts(tx, input)).stops.find(
					(row) => row.obligationId === stop.obligationId,
				)!;
				if (current.state === "confirmed") return;
				await updateStop(tx, {
					expectedRevision: current.revision,
					obligation: { ...observed.obligation, revision: current.revision + 1 },
				});
				await saveStopState({ ...ctx.core, now: ctx.now() }, tx, input);
			});
			if (observed.error !== null)
				ctx.log("Langflow native stop remains unconfirmed", {
					executionId: input.executionId,
					attemptId: stop.attemptId,
					error: observed.error,
				});
		});
	}
	const current = await ctx.newTx((tx) => readProjectionFacts(tx, input));
	return { needsStop: current.stops.some((stop) => stop.state !== "confirmed"), stops: current.stops };
}
