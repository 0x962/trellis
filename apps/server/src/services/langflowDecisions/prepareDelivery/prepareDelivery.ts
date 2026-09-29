import type { ServiceCtx } from "../../../context.ts";
import {
	assertAuthority,
	lockExecution,
	readDecision,
	updateDecisionDelivery,
} from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import { fail } from "../../../errors.ts";
import type { DeliveryAuthorityV1 } from "../../../langflowContracts";
import { saveDecisionDelivery } from "../../langflowProjection";
import type { PreparedDecision } from "../deliver";

export async function prepareDelivery(
	ctx: ServiceCtx,
	tx: Tx,
	input: { executionId: string; decisionId: string; authority: DeliveryAuthorityV1 },
): Promise<PreparedDecision | null> {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	const execution = await lockExecution(tx, input);
	await assertAuthority(tx, execution, input.authority, "decision.deliver", ctx.now);
	if (execution.cancelIntent) return null;
	const stored = await readDecision(tx, input);
	if (!stored) throw fail("NOT_FOUND", { kind: "human decision", ref: input.decisionId });
	if (stored.delivery.state === "confirmed") return null;
	const delivery = await updateDecisionDelivery(tx, { ...input, state: "pending" });
	await saveDecisionDelivery(ctx, tx, delivery);
	return { payloadBytes: stored.payloadBytes, delivery, authority: input.authority };
}
