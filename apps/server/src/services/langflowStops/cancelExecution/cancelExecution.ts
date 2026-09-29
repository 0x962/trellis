import { randomUUID } from "node:crypto";
import type { FlowExecutionCancelInput } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import {
	lockExecution,
	readProjectionFacts,
	cancelExecution as recordCancellation,
} from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import { fail, invalidInput } from "../../../errors.ts";
import type { CancelIntentV1 } from "../../../langflowContracts";
import { stopObligation } from "../stopObligation";

export async function cancelExecution(ctx: ServiceCtx, tx: Tx, input: FlowExecutionCancelInput) {
	if (ctx.actor?.kind !== "human") throw invalidInput("actor", "A person must cancel a flow.");
	const executionId = input.id;
	const execution = await lockExecution(tx, { executionId });
	if (execution.revision !== input.expectedRevision)
		throw fail("FLOW_VERSION_CONFLICT", { version: execution.revision });
	const facts = await readProjectionFacts(tx, { executionId });
	if (execution.cancelIntent !== null)
		return { intent: execution.cancelIntent, needsStop: facts.stops.some((stop) => stop.state !== "confirmed") };
	const intent: CancelIntentV1 = {
		version: 1,
		executionId,
		requestId: randomUUID(),
		actor: { kind: "human", name: ctx.actor.name },
		expectedRevision: input.expectedRevision,
		requestedAt: ctx.now.toISOString(),
	};
	const obligations = facts.native.map(
		({ handle }) =>
			facts.stops.find((stop) => stop.attemptId === handle.attemptId) ??
			stopObligation({ executionId, handle, reason: "canceled", now: ctx.now }),
	);
	await recordCancellation(tx, { intent, obligations });
	ctx.emit({ type: "flows.changed", id: execution.flowId });
	return { intent, needsStop: obligations.some((stop) => stop.state !== "confirmed") };
}
