import type { FlowAttemptOutputV1, FlowAttemptOutputV1Input } from "@trellis/api";
import type { ServiceCtx } from "../../../context";
import type { Tx } from "../../../db/tx";
import { readNativeOutput } from "../../langflowNative";
import { getView } from "../getView";

export async function output(ctx: ServiceCtx, tx: Tx, input: FlowAttemptOutputV1Input): Promise<FlowAttemptOutputV1> {
	const view = await getView(ctx, tx, { id: input.executionId });
	if (view.engine === "langflow") {
		const retained = await readNativeOutput(ctx, tx, input);
		return { ...input, output: retained.status === "available" ? retained.result.output : null };
	}
	const occurrence = view.occurrences.find(
		({ outputSource }) =>
			outputSource !== null &&
			outputSource.stepId === input.stepId &&
			outputSource.agentRunId === input.agentRunId &&
			outputSource.attemptId === input.attemptId &&
			outputSource.resultId === input.resultId,
	);
	return { ...input, output: occurrence?.output ?? null };
}
