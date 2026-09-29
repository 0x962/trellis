import type { ServiceCtx } from "../../../context";
import { lockExecution, readProjectionFacts, updateStop } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { StopObligationV1Schema, type StopObligationV1 } from "../../../langflowContracts";
import { saveStopState } from "../../langflowProjection";

export async function settleNativeStop(
	ctx: ServiceCtx, tx: Tx, input: { expectedRevision: number; obligation: StopObligationV1 },
) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	const obligation = StopObligationV1Schema.parse(input.obligation);
	await lockExecution(tx, obligation);
	const current = (await readProjectionFacts(tx, obligation)).stops.find((stop) => stop.obligationId === obligation.obligationId);
	if (!current) throw new Error("stop_not_found");
	if (current.executionId !== obligation.executionId || current.attemptId !== obligation.attemptId ||
		current.agentRunId !== obligation.agentRunId || current.stepId !== obligation.stepId) throw new Error("stop_attempt_conflict");
	if (current.state === "confirmed") return current;
	const saved = await updateStop(tx, { expectedRevision: input.expectedRevision, obligation });
	await saveStopState(ctx, tx, obligation);
	return saved;
}
