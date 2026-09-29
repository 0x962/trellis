import {
	type DecisionLookupRequestV1,
	DecisionLookupResultV1Schema,
	type HumanDeliveryV1,
	HumanDeliveryV1Schema,
} from "../../../../../langflowContracts";

export function acceptance(delivery: HumanDeliveryV1, lookup: DecisionLookupRequestV1, response: unknown) {
	const result = DecisionLookupResultV1Schema.parse(response);
	if (result.state === "accepted") {
		return HumanDeliveryV1Schema.parse({ ...delivery, state: "confirmed", acceptance: result.receipt });
	}
	for (const field of ["executionId", "engineJobId", "engineRequestId", "decisionId", "payloadDigest"] as const) {
		if (result.lookup[field] !== lookup[field]) throw new Error("decision_lookup_conflict");
	}
	if (result.state === "conflict") throw new Error("decision_acceptance_conflict");
	return { ...delivery, state: "unknown" as const, acceptance: null };
}
