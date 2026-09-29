import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../context";
import { lockExecution } from "../../../../db/queries/langflowExecution";
import { rows } from "../../../../db/queries/support";
import { agentRuns } from "../../../../db/tables/agentRuns";
import { langflowCompletions, langflowNativeHandles } from "../../../../db/tables/langflowExecution";
import type { Tx } from "../../../../db/tx";
import { readCompletionDelivery } from "../../readCompletionDelivery";
import { readReservation } from "../../readReservation";
import type { NativeRuntimeRow, RuntimeStateInput } from "../contracts";

export async function runtimeState(ctx: ServiceCtx, tx: Tx, request: RuntimeStateInput) {
	if (ctx.actor?.kind !== "system") throw new Error("langflow_internal_native_required");
	if (request.operation === "pending") {
		const found = await rows<{ execution_id: string }>(
			tx,
			sql`
			SELECT DISTINCT e.execution_id FROM langflow_executions e
			JOIN langflow_native_handles h ON h.execution_id=e.execution_id
			JOIN agent_runs r ON r.id=h.agent_run_id
			LEFT JOIN langflow_completions c ON c.step_id=h.step_id
			WHERE e.host_id=${request.hostId} AND e.execution_id>${request.input.afterId}
			AND (c.completion_id IS NULL OR r.closed_at IS NULL
				OR (c.acceptance IS NULL AND e.cancel_intent IS NULL))
			ORDER BY e.execution_id LIMIT 100`,
		);
		return found.map((row) => row.execution_id);
	}
	const execution = await lockExecution(tx, request.input);
	if (execution.hostId !== request.hostId) throw new Error("native_host_conflict");
	if (request.operation === "receipt") {
		const [completion] = await tx
			.select()
			.from(langflowCompletions)
			.where(
				and(
					eq(langflowCompletions.executionId, request.input.executionId),
					eq(langflowCompletions.completionId, request.input.completionId),
				),
			);
		return completion?.acceptance ?? null;
	}
	if (request.operation === "steps") {
		const found = await tx
			.select({ native: langflowNativeHandles, completion: langflowCompletions, closedAt: agentRuns.closedAt })
			.from(langflowNativeHandles)
			.innerJoin(agentRuns, eq(agentRuns.id, langflowNativeHandles.agentRunId))
			.leftJoin(langflowCompletions, eq(langflowCompletions.stepId, langflowNativeHandles.stepId))
			.where(
				and(
					eq(langflowNativeHandles.executionId, request.input.executionId),
					gt(langflowNativeHandles.stepId, request.input.afterStepId),
				),
			)
			.orderBy(asc(langflowNativeHandles.stepId))
			.limit(100);
		return found.map(
			({ native, completion, closedAt }): NativeRuntimeRow => ({
				executionId: native.executionId,
				stepId: native.stepId,
				handle: native.handle,
				requestBytes: native.requestBytes,
				authority: execution.authority,
				canceled: execution.cancelIntent !== null,
				admissionOpen: execution.admission.state === "open",
				observe: completion === null || closedAt === null,
				completionId: completion?.completionId ?? null,
			}),
		);
	}
	if (execution.cancelIntent !== null || execution.authority === null) return null;
	const reservation = await readReservation(tx, request.input);
	const [completion] = await tx
		.select()
		.from(langflowCompletions)
		.where(eq(langflowCompletions.stepId, reservation.stepId));
	if (!completion || completion.acceptance !== null) return null;
	const delivery = await readCompletionDelivery({ ...ctx, nativeAuthority: execution.authority }, tx, {
		executionId: execution.executionId,
		completionId: completion.completionId,
	});
	return {
		requestBytes: reservation.requestBytes,
		resultBytes: delivery.resultBytes,
		deliveryBytes: JSON.stringify(delivery.delivery),
		authority: execution.authority,
		handle: reservation.handle,
	};
}
