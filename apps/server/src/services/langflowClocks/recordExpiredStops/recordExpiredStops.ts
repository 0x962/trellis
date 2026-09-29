import type { ServiceCtx } from "../../../context.ts";
import { lockExecution, readProjectionFacts, recordStop } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import { stopObligation } from "../../langflowStops/stopObligation";
import { earliestDeadline } from "../earliestDeadline";

export async function recordExpiredStops(ctx: ServiceCtx, tx: Tx, input: { executionId: string }) {
	const execution = await lockExecution(tx, input);
	const facts = await readProjectionFacts(tx, input);
	const obligations = [];
	for (const native of facts.native) {
		if (facts.stops.some((stop) => stop.attemptId === native.handle.attemptId)) continue;
		const refs = native.provenance.request.groupDeadlineRefs;
		const deadline = earliestDeadline(facts.deadlines.filter((value) => refs.includes(value.deadlineId)));
		if (deadline === null || Date.parse(deadline.deadlineAt!) > ctx.now.getTime()) continue;
		obligations.push(
			await recordStop(tx, {
				obligation: stopObligation({
					executionId: input.executionId,
					handle: native.handle,
					reason: "deadline",
					now: ctx.now,
				}),
			}),
		);
	}
	if (obligations.length > 0) ctx.emit({ type: "flows.changed", id: execution.flowId });
	return obligations;
}
