import type { DeliveryAuthorityV1 } from "../../../langflowContracts";
import type { IoCtx } from "../../support.ts";
import { type DecisionEngine, deliver } from "../deliver";
import { prepareDelivery } from "../prepareDelivery";
import { recordAcknowledgement } from "../recordAcknowledgement";

export async function deliverDecision(
	ctx: Pick<IoCtx, "core" | "newTx" | "log">,
	input: { executionId: string; decisionId: string; authority: DeliveryAuthorityV1 },
	engine: DecisionEngine,
) {
	const prepared = await ctx.newTx((tx) => prepareDelivery(ctx.core, tx, input));
	if (prepared === null) return null;
	const delivery = await deliver(prepared, engine, ctx.log);
	return ctx.newTx((tx) => recordAcknowledgement(ctx.core, tx, { ...input, delivery }));
}
