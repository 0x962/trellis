import type { FlowDecisionDeliveryV1, FlowStopObligationV1 } from "@trellis/api";
import type { HumanDeliveryV1, StopObligationV1 } from "../../langflowContracts";

export function publicDecision(delivery: HumanDeliveryV1): FlowDecisionDeliveryV1 {
	const { decision } = delivery;
	const fields = {
		decisionId: decision.decisionId,
		payloadDigest: delivery.payloadDigest,
		engineRequestId: decision.wait.engineRequestId,
		actionKey: decision.wait.actionKey,
		occurrenceKey: decision.wait.occurrence.occurrenceKey,
		actor: decision.actor,
		approved: decision.approved,
		output: decision.output,
		expectedRevision: decision.wait.expectedRevision,
		recordedAt: decision.recordedAt,
	};
	return delivery.state === "confirmed"
		? {
				...fields,
				state: "confirmed",
				acceptedReceiptId: delivery.acceptance.acceptanceId,
				confirmedAt: delivery.acceptance.acceptedAt,
			}
		: { ...fields, state: delivery.state, acceptedReceiptId: null, confirmedAt: null };
}

export function publicStop(stop: StopObligationV1): FlowStopObligationV1 {
	const fields = {
		stepId: stop.stepId,
		agentRunId: stop.agentRunId,
		attemptId: stop.attemptId,
		reason: stop.reason,
		requestedAt: stop.requestedAt,
	};
	return stop.state === "confirmed"
		? { ...fields, state: "confirmed", confirmedAt: stop.exitReceipt.confirmedAt }
		: { ...fields, state: stop.state, confirmedAt: null };
}
