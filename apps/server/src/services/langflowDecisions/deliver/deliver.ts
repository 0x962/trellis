import type { JobsLog } from "../../../jobs.ts";
import {
	DecisionDeliveryV1Schema,
	type DecisionLookupRequestV1,
	DecisionLookupResultV1Schema,
	type DeliveryAuthorityV1,
	HumanDecisionReceiptV1Schema,
	type HumanDeliveryV1,
	readProtocolBytes,
} from "../../../langflowContracts";
import { acceptance } from "./components/acceptance";

export type DecisionEngine = {
	lookup(input: DecisionLookupRequestV1): Promise<unknown>;
	accept(input: { decisionBytes: string; payloadDigest: string; authority: DeliveryAuthorityV1 }): Promise<unknown>;
};
export type PreparedDecision = {
	payloadBytes: string;
	delivery: HumanDeliveryV1;
	authority: DeliveryAuthorityV1;
};

export async function deliver(
	prepared: PreparedDecision,
	engine: DecisionEngine,
	log: JobsLog,
): Promise<HumanDeliveryV1> {
	const { delivery, payloadBytes, authority } = prepared;
	if (delivery.state === "confirmed") return delivery;
	const decision = readProtocolBytes(HumanDecisionReceiptV1Schema, payloadBytes, delivery.payloadDigest);
	const request = DecisionDeliveryV1Schema.parse({
		version: 1,
		decision,
		payloadDigest: delivery.payloadDigest,
		authority,
	});
	const lookup: DecisionLookupRequestV1 = {
		version: 1,
		executionId: decision.wait.executionId,
		engineJobId: decision.wait.engineJobId,
		engineRequestId: decision.wait.engineRequestId,
		decisionId: decision.decisionId,
		payloadDigest: delivery.payloadDigest,
	};
	const failed = (operation: "lookup" | "accept", error: unknown): HumanDeliveryV1 => {
		const category =
			error instanceof Error && ["AbortError", "TimeoutError", "TypeError"].includes(error.name)
				? error.name
				: "request_failed";
		log("Human decision delivery failed", {
			operation,
			executionId: lookup.executionId,
			decisionId: lookup.decisionId,
			engineRequestId: lookup.engineRequestId,
			category,
		});
		return { ...delivery, state: "unknown", acceptance: null };
	};
	let response: unknown;
	try {
		response = await engine.lookup(lookup);
	} catch (error) {
		return failed("lookup", error);
	}
	const checked = acceptance(delivery, lookup, response);
	const result = DecisionLookupResultV1Schema.parse(response);
	if (result.state !== "absent") return checked;
	try {
		response = await engine.accept({ decisionBytes: payloadBytes, payloadDigest: request.payloadDigest, authority });
	} catch (error) {
		return failed("accept", error);
	}
	return acceptance(delivery, lookup, { state: "accepted", receipt: response });
}
