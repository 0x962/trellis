import type { FlowDecisionDeliveryV1 } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import { commitProjection, readProjection } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import type { HumanDeliveryV1 } from "../../../langflowContracts";

export async function saveDelivery(ctx: ServiceCtx, tx: Tx, delivery: HumanDeliveryV1) {
	const { decision, payloadDigest } = delivery;
	const { wait } = decision;
	const stored = (await readProjection(tx, { executionId: wait.executionId }))!;
	const common = {
		decisionId: decision.decisionId,
		payloadDigest,
		engineRequestId: wait.engineRequestId,
		actionKey: wait.actionKey,
		occurrenceKey: wait.occurrence.occurrenceKey,
		actor: decision.actor,
		approved: decision.approved,
		output: decision.output,
		expectedRevision: wait.expectedRevision,
		recordedAt: decision.recordedAt,
	};
	const value: FlowDecisionDeliveryV1 =
		delivery.state === "confirmed"
			? {
					...common,
					state: "confirmed",
					acceptedReceiptId: delivery.acceptance.acceptanceId,
					confirmedAt: delivery.acceptance.acceptedAt,
				}
			: { ...common, state: delivery.state, acceptedReceiptId: null, confirmedAt: null };
	const previous = stored.view.decisionDeliveries.find((row) => row.decisionId === decision.decisionId);
	if (previous?.state === value.state) return stored.view;
	const view = {
		...stored.view,
		revision: stored.view.revision + 1,
		updatedAt: ctx.now.toISOString(),
		decisionDeliveries: [
			...stored.view.decisionDeliveries.filter((row) => row.decisionId !== decision.decisionId),
			value,
		],
	};
	await commitProjection(tx, {
		executionId: wait.executionId,
		expectedRevision: stored.view.revision,
		view,
		event: null,
		sourceBytes: null,
	});
	ctx.emit({ type: "flows.changed", id: view.flowId });
	return view;
}
