import { protocolDigest } from "../../langflowContracts";
import type { RenewalIntent, TakeoverIntent } from "../authority/authority";
import type { EffectBinding } from "../dispatchGate/contracts";

export function authorityPermitBinding(input: RenewalIntent | TakeoverIntent, engineJobId: string): EffectBinding {
	const intent = {
		operation: "expectedOwnerId" in input ? "takeover" : "renewal",
		executionId: input.executionId,
		requestId: input.requestId,
		expectedRevision: input.expectedRevision,
		expiresAt: input.expiresAt,
		...("expectedOwnerId" in input
			? { expectedOwnerId: input.expectedOwnerId, expectedEpoch: input.expectedEpoch }
			: {}),
	};
	return {
		effectId: `authority:${input.executionId}:${input.requestId}`,
		kind: "recovery",
		executionId: input.executionId,
		attemptId: null,
		jobId: engineJobId,
		requestId: input.requestId,
		payloadDigest: protocolDigest(JSON.stringify(intent)),
	};
}
