import type { ServiceCtx } from "../../../context.ts";
import { lockExecution, readProjectionFacts, recordDeadline } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import { earliestDeadline } from "../earliestDeadline";
import { startDeadline } from "../startDeadline";

export async function recordLaunchClocks(ctx: ServiceCtx, tx: Tx, input: { executionId: string; stepId: string }) {
	const execution = await lockExecution(tx, input);
	const facts = await readProjectionFacts(tx, input);
	const native = facts.native.find((row) => row.handle.stepId === input.stepId)!;
	const receipt = native.launchReceipt;
	if (receipt === null) return null;
	const deadlines = [];
	let started = false;
	for (const ref of native.provenance.request.groupDeadlineRefs) {
		const deadline = facts.deadlines.find((value) => value.deadlineId === ref)!;
		started ||= deadline.launchedAt === null;
		deadlines.push(
			await recordDeadline(tx, { executionId: input.executionId, deadline: startDeadline(deadline, receipt) }),
		);
	}
	if (started) ctx.emit({ type: "flows.changed", id: execution.flowId });
	return earliestDeadline(deadlines);
}
