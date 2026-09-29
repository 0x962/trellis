import type { FlowOccurrenceV1 } from "@trellis/api";
import type { ReviewWaitV1 } from "../../langflowContracts";
import { reviewGateResult } from "../langflowGates";
import type { ProjectionFacts } from "./facts.ts";
import { nativeOccurrence } from "./nativeOccurrence.ts";
import type { ObservedOccurrence } from "./observation.ts";

export function projectOccurrence(
	observed: ObservedOccurrence,
	previous: FlowOccurrenceV1 | undefined,
	facts: ProjectionFacts,
	reviewWait: ReviewWaitV1 | undefined,
): FlowOccurrenceV1 {
	const { reviewArea: _reviewArea, acceptedResultId: _acceptedResultId, ...fields } = observed;
	const base: FlowOccurrenceV1 = {
		...fields,
		waitReason: null,
		output: previous?.output ?? null,
		outputSource: previous?.outputSource ?? null,
		decision: previous?.decision ?? null,
		attempts: previous?.attempts ?? [],
	};
	const nativeFacts = facts.native.filter((item) => item.provenance.request.occurrenceKey === observed.occurrenceKey);
	if (nativeFacts.length > 0) return nativeOccurrence(observed, base, nativeFacts);
	if (observed.kind === "human") {
		const delivery = facts.human.find((item) => item.decision.wait.occurrence.occurrenceKey === observed.occurrenceKey);
		if (!delivery) {
			return {
				...base,
				state: observed.state === "succeeded" ? "unknown" : observed.state,
				waitReason:
					observed.state === "waiting_human" ? "human" : observed.state === "succeeded" ? "ownership_unknown" : null,
			};
		}
		const { decision } = delivery;
		const confirmed = delivery.state === "confirmed" && observed.acceptedResultId === decision.decisionId;
		return {
			...base,
			state:
				observed.state === "failed" || observed.state === "canceled"
					? observed.state
					: confirmed
						? observed.state
						: delivery.state === "unknown"
							? "unknown"
							: "waiting_human",
			waitReason: confirmed ? null : delivery.state === "unknown" ? "ownership_unknown" : "human",
			output: decision.output,
			decision: confirmed ? (decision.approved ? "yes" : "no") : null,
		};
	}
	if (observed.kind === "gate" && observed.reviewArea !== null) {
		if (reviewWait) {
			const ended = observed.state === "failed" || observed.state === "canceled";
			return {
				...base,
				state: ended ? observed.state : "running",
				waitReason: ended ? null : "review",
				endedAt: ended ? base.endedAt : null,
				decision: null,
			};
		}
		const receipt = facts.classification;
		if (!receipt) return { ...base, state: "unknown", waitReason: "ownership_unknown" };
		const gate = reviewGateResult(receipt, observed.reviewArea);
		if (gate.state === "pending" || observed.acceptedResultId !== receipt.receiptId)
			return {
				...base,
				state: "unknown",
				waitReason: "ownership_unknown",
				output: gate.state === "succeeded" ? gate.output : base.output,
			};
		if (gate.state === "failed") return { ...base, state: "failed", error: gate.error };
		return { ...base, output: gate.output, decision: gate.decision };
	}
	if (
		observed.kind === "agent" ||
		(observed.kind === "gate" && observed.reviewArea === null) ||
		observed.phase === "condition"
	) {
		return nativeOccurrence(observed, base, nativeFacts);
	}
	return base;
}
