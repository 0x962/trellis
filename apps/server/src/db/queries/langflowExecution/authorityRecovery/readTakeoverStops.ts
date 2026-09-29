import { asc, eq } from "drizzle-orm";
import { protocolDigest, type StopObligationV1 } from "../../../../langflowContracts";
import { langflowNativeHandles, langflowStops } from "../../../tables/langflowExecution";
import type { Tx } from "../../../tx";
import { lockExecution } from "../executions";

export type TakeoverStopEvidence = { ready: boolean; sourceBytes: string; sourceDigest: string };
function stopSource(stop: StopObligationV1) {
	return {
		version: stop.version,
		obligationId: stop.obligationId,
		executionId: stop.executionId,
		stepId: stop.stepId,
		agentRunId: stop.agentRunId,
		attemptId: stop.attemptId,
		reason: stop.reason,
		requestedAt: stop.requestedAt,
		revision: stop.revision,
		state: stop.state,
		exitReceipt: stop.exitReceipt
			? {
					attemptId: stop.exitReceipt.attemptId,
					receiptId: stop.exitReceipt.receiptId,
					exitedAt: stop.exitReceipt.exitedAt,
					confirmedAt: stop.exitReceipt.confirmedAt,
				}
			: null,
	};
}
export async function readTakeoverStops(tx: Tx, input: { executionId: string }): Promise<TakeoverStopEvidence> {
	const execution = await lockExecution(tx, input);
	const native = await tx
		.select()
		.from(langflowNativeHandles)
		.where(eq(langflowNativeHandles.executionId, input.executionId))
		.orderBy(asc(langflowNativeHandles.stepId));
	const stops = await tx
		.select()
		.from(langflowStops)
		.where(eq(langflowStops.executionId, input.executionId))
		.orderBy(asc(langflowStops.obligationId));
	const exact = (stop: StopObligationV1, attempt: (typeof native)[number]) =>
		stop.executionId === execution.executionId &&
		stop.stepId === attempt.stepId &&
		stop.agentRunId === attempt.agentRunId &&
		stop.attemptId === attempt.attemptId &&
		stop.state === "confirmed" &&
		stop.exitReceipt.attemptId === attempt.attemptId;
	const ready =
		stops.every((row) => native.some((attempt) => exact(row.obligation, attempt))) &&
		(execution.cancelIntent === null || native.every((attempt) => stops.some((row) => exact(row.obligation, attempt))));
	const intent = execution.cancelIntent;
	const sourceBytes = JSON.stringify({
		version: 1,
		executionId: execution.executionId,
		executionRevision: execution.revision,
		cancelIntent: intent
			? {
					version: intent.version,
					executionId: intent.executionId,
					requestId: intent.requestId,
					actor: { kind: intent.actor.kind, name: intent.actor.name },
					expectedRevision: intent.expectedRevision,
					requestedAt: intent.requestedAt,
				}
			: null,
		native: native.map((row) => ({ stepId: row.stepId, agentRunId: row.agentRunId, attemptId: row.attemptId })),
		stops: stops.map((row) => stopSource(row.obligation)),
	});
	return { ready, sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
}
