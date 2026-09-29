import type { ServiceCtx } from "../../../context.ts";
import { commitProjection, readProjection } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import type { HumanDeliveryV1 } from "../../../langflowContracts";

import { publicDecision } from "../publicDetails.ts";

export async function saveDecisionDelivery(ctx: ServiceCtx, tx: Tx, delivery: HumanDeliveryV1) {
	const { decision } = delivery;
	const { wait } = decision;
	const stored = (await readProjection(tx, { executionId: wait.executionId }))!;
	const value = publicDecision(delivery);
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
