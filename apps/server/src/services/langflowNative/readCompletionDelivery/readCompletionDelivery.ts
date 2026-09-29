import { and, eq } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { assertAuthority, lockExecution } from "../../../db/queries/langflowExecution/executions";
import { langflowCompletions } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { CompletionDeliveryV1Schema, type DeliveryAuthorityV1 } from "../../../langflowContracts";

export async function readCompletionDelivery(
	ctx: ServiceCtx & { nativeAuthority: DeliveryAuthorityV1 },
	tx: Tx,
	input: { executionId: string; completionId: string },
) {
	const execution = await lockExecution(tx, input);
	await assertAuthority(tx, execution, ctx.nativeAuthority, "completion.deliver", ctx.now);
	if (execution.cancelIntent) throw new Error("execution_canceled");
	const [row] = await tx
		.select()
		.from(langflowCompletions)
		.where(
			and(
				eq(langflowCompletions.executionId, input.executionId),
				eq(langflowCompletions.completionId, input.completionId),
			),
		);
	if (!row) throw new Error("native_completion_not_found");
	return {
		resultBytes: row.resultBytes,
		receipt: row.acceptance,
		delivery: CompletionDeliveryV1Schema.parse({
			version: 1,
			result: row.completion.result,
			resultDigest: row.resultDigest,
			authority: ctx.nativeAuthority,
		}),
	};
}
