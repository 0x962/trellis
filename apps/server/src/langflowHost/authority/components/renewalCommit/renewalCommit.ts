import { protocolDigest, RenewalReceiptV1Schema } from "../../../../langflowContracts";
import type { AuthorityCommit, LiveOwnership, OwnershipSnapshot } from "../../../contracts";
import type { RenewalInput } from "../../authority";

export function renewalCommit(
	observation: LiveOwnership,
	input: RenewalInput,
	snapshot: OwnershipSnapshot,
): AuthorityCommit {
	const { authority: current, canceled } = snapshot;
	const request = {
		version: 1 as const,
		requestId: input.requestId,
		executionId: input.executionId,
		ownerId: current.ownerId,
		engineEpoch: current.engineEpoch,
		expectedRevision: input.expectedRevision,
		supervisorObservationId: observation.id,
	};
	const requestBytes = JSON.stringify(request);
	const receipt = RenewalReceiptV1Schema.parse({
		version: 1,
		request,
		requestDigest: protocolDigest(requestBytes),
		renewalId: crypto.randomUUID(),
		authority: {
			...current,
			permissions: canceled ? ["execution.cancel"] : current.permissions,
			ownershipRevision: current.ownershipRevision + 1,
			capabilityId: crypto.randomUUID(),
			issuedAt: observation.observedAt,
			expiresAt: input.expiresAt,
		},
	});
	return {
		permit: input.permit,
		requestBytes,
		authorityBytes: JSON.stringify(receipt.authority),
		receipt,
		observation,
		revocation: null,
	};
}
