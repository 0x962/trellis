import { protocolDigest, TakeoverReceiptV1Schema } from "../../../../langflowContracts";
import type { AuthorityCommit, LiveOwnership, OwnerRevocation, OwnershipSnapshot } from "../../../contracts";
import type { TakeoverInput } from "../../authority";

export function takeoverCommit(
	observation: LiveOwnership,
	input: TakeoverInput,
	snapshot: OwnershipSnapshot,
	revocation: OwnerRevocation,
): AuthorityCommit {
	const { authority: current, admission, canceled } = snapshot;
	const request = {
		version: 1 as const,
		executionId: input.executionId,
		requestId: input.requestId,
		expectedOwnerId: input.expectedOwnerId,
		expectedEpoch: input.expectedEpoch,
		expectedRevision: input.expectedRevision,
		newOwnerId: observation.identity.ownerId,
		supervisorObservationId: observation.id,
		priorOwnerRevocationId: revocation.id,
	};
	const requestBytes = JSON.stringify(request);
	const receipt = TakeoverReceiptV1Schema.parse({
		version: 1,
		request,
		requestDigest: protocolDigest(requestBytes),
		transferId: crypto.randomUUID(),
		committedAt: observation.observedAt,
		authority: {
			...current,
			permissions: canceled ? ["execution.cancel"] : current.permissions,
			ownerId: observation.identity.ownerId,
			engineEpoch: current.engineEpoch + 1,
			ownershipRevision: current.ownershipRevision + 1,
			capabilityId: crypto.randomUUID(),
			issuedAt: observation.observedAt,
			expiresAt: input.expiresAt,
		},
		admission:
			admission.state === "closed"
				? admission
				: {
						state: "open",
						receipt: {
							...admission.receipt,
							engineEpoch: current.engineEpoch + 1,
							admissionId: crypto.randomUUID(),
							committedAt: observation.observedAt,
						},
					},
	});
	return {
		permit: input.permit,
		requestBytes,
		authorityBytes: JSON.stringify(receipt.authority),
		receipt,
		observation,
		revocation,
	};
}
