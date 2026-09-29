import { isDeepStrictEqual } from "node:util";
import type { ServiceCtx } from "../../../context.ts";
import { lockExecution, readDecision, updateDecisionDelivery } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import { fail } from "../../../errors.ts";
import { type HumanDeliveryV1, HumanDeliveryV1Schema } from "../../../langflowContracts";
import { saveDecisionDelivery } from "../../langflowProjection";

export async function recordAcknowledgement(
	ctx: ServiceCtx,
	tx: Tx,
	input: { executionId: string; decisionId: string; delivery: HumanDeliveryV1 },
) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	await lockExecution(tx, input);
	const stored = await readDecision(tx, input);
	if (!stored) throw fail("NOT_FOUND", { kind: "human decision", ref: input.decisionId });
	const delivery = HumanDeliveryV1Schema.parse(input.delivery);
	if (
		delivery.payloadDigest !== stored.delivery.payloadDigest ||
		!isDeepStrictEqual(delivery.decision, stored.delivery.decision)
	) {
		throw new Error("decision_acceptance_conflict");
	}
	if (delivery.state !== "unknown" && delivery.state !== "confirmed")
		throw new Error("decision_acknowledgement_required");
	const key = { executionId: input.executionId, decisionId: input.decisionId };
	const saved = await updateDecisionDelivery(
		tx,
		delivery.state === "confirmed"
			? { ...key, state: "confirmed", acceptance: delivery.acceptance }
			: { ...key, state: "unknown" },
	);
	return saveDecisionDelivery(ctx, tx, saved);
}
