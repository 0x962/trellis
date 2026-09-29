import { and, eq } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { langflowCompletions, langflowNativeHandles } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";

export async function readNativeOutput(
	_ctx: ServiceCtx,
	tx: Tx,
	input: { executionId: string; stepId: string; agentRunId: string; attemptId: string; resultId: string },
) {
	const [reservation] = await tx
		.select()
		.from(langflowNativeHandles)
		.where(
			and(
				eq(langflowNativeHandles.executionId, input.executionId),
				eq(langflowNativeHandles.stepId, input.stepId),
				eq(langflowNativeHandles.agentRunId, input.agentRunId),
				eq(langflowNativeHandles.attemptId, input.attemptId),
			),
		);
	if (!reservation) return { ...input, status: "unavailable" as const, reason: "reservation_not_found" as const };
	const [completion] = await tx
		.select()
		.from(langflowCompletions)
		.where(
			and(
				eq(langflowCompletions.executionId, input.executionId),
				eq(langflowCompletions.stepId, input.stepId),
				eq(langflowCompletions.attemptId, input.attemptId),
				eq(langflowCompletions.resultId, input.resultId),
			),
		);
	if (!completion) return { ...input, status: "unavailable" as const, reason: "result_not_retained" as const };
	const result = completion.completion.result;
	if (result.agentRunId !== input.agentRunId || result.requestDigest !== reservation.requestDigest)
		throw new Error("native_output_binding_conflict");
	return { ...input, status: "available" as const, result, resultBytes: completion.resultBytes };
}
