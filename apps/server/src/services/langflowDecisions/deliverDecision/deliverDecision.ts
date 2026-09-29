import type { DeliveryAuthorityV1 } from "../../../langflowContracts";
import type { FlowCtx } from "../../flowExecutions/types.ts";
import { type DecisionEngine, deliver } from "../deliver";
import { prepareDelivery } from "../prepareDelivery";
import { recordAcknowledgement } from "../recordAcknowledgement";

export async function deliverDecision(
	ctx: Pick<FlowCtx, "core" | "newTx">,
	input: { executionId: string; decisionId: string; authority: DeliveryAuthorityV1 },
	engine: DecisionEngine,
) {
	const prepared = await ctx.newTx((tx) => prepareDelivery(ctx.core, tx, input));
	if (prepared === null) return null;
	const delivery = await deliver(prepared, engine);
	return ctx.newTx((tx) => recordAcknowledgement(ctx.core, tx, { ...input, delivery }));
}
