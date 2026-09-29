import { asc } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { readProjectionFacts } from "../../../db/queries/langflowExecution";
import { langflowExecutions } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { protocolDigest } from "../../../langflowContracts";

export async function readStopReconciliation(
	_ctx: ServiceCtx,
	tx: Tx,
	input: { dataHomeId: string; blockId: string; generation: number },
) {
	const executions = await tx.select().from(langflowExecutions).orderBy(asc(langflowExecutions.executionId));
	const records = [];
	for (const execution of executions) {
		const facts = await readProjectionFacts(tx, { executionId: execution.executionId });
		records.push({
			executionId: execution.executionId,
			cancelIntent: execution.cancelIntent,
			stops: facts.stops.toSorted((a, b) => a.obligationId.localeCompare(b.obligationId)),
			deadlines: facts.deadlines.toSorted((a, b) => a.deadlineId.localeCompare(b.deadlineId)),
			native: facts.native
				.map(({ handle, launchReceipt, provenance }) => ({
					stepId: handle.stepId,
					agentRunId: handle.agentRunId,
					attemptId: handle.attemptId,
					state: handle.state,
					revision: handle.revision,
					launchReceipt,
					deadlineRefs: provenance.request.groupDeadlineRefs,
				}))
				.sort((a, b) => a.stepId.localeCompare(b.stepId)),
		});
	}
	const snapshot = { version: 1, ...input, records };
	const sourceBytes = JSON.stringify(snapshot);
	return {
		receiptId: protocolDigest(sourceBytes),
		sourceBytes,
		snapshot,
		unconfirmed: records.flatMap((row) => row.stops.filter((stop) => stop.state !== "confirmed")),
	};
}
