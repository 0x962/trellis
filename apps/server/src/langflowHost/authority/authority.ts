import { isDeepStrictEqual } from "node:util";
import { protocolDigest, RenewalReceiptV1Schema, TakeoverReceiptV1Schema } from "../../langflowContracts";
import type { AuthorityPort, LiveOwnership, OwnershipSnapshot } from "../contracts";
import type { DispatchPermit } from "../dispatchGate/contracts";

export type RenewalIntent = {
	executionId: string;
	requestId: string;
	expectedRevision: number;
	expiresAt: string;
};

export type TakeoverIntent = RenewalIntent & {
	expectedOwnerId: string;
	expectedEpoch: number;
};

export type RenewalInput = RenewalIntent & { permit: DispatchPermit };
export type TakeoverInput = TakeoverIntent & { permit: DispatchPermit };

export class ExecutionAuthority {
	constructor(private readonly store: AuthorityPort) {}

	async renew(observation: LiveOwnership, input: RenewalInput) {
		const snapshot = await this.store.read(input.executionId);
		const saved = await this.store.readReceipt(input);
		this.assertCancellation(snapshot, saved?.receipt.authority.permissions);
		if (saved) {
			const receipt = saved.receipt;
			if (!isDeepStrictEqual(saved.permit, input.permit)) throw new Error("authority_permit_conflict");
			if (
				!("renewalId" in receipt) ||
				receipt.request.ownerId !== observation.identity.ownerId ||
				receipt.request.expectedRevision !== input.expectedRevision ||
				receipt.authority.expiresAt !== input.expiresAt
			)
				throw new Error("identity_conflict");
			return receipt;
		}
		const { authority: current, canceled } = snapshot;
		if (
			current.hostId !== observation.identity.hostId ||
			current.ownerId !== observation.identity.ownerId ||
			current.ownershipRevision !== input.expectedRevision
		)
			throw new Error("ownership_conflict");
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
		return this.store.commit({
			permit: input.permit,
			requestBytes,
			authorityBytes: JSON.stringify(receipt.authority),
			receipt,
			observation,
			revocation: null,
		});
	}

	async takeover(observation: LiveOwnership, input: TakeoverInput) {
		const snapshot = await this.store.read(input.executionId);
		const saved = await this.store.readReceipt(input);
		this.assertCancellation(snapshot, saved?.receipt.authority.permissions);
		if (saved) {
			const receipt = saved.receipt;
			if (!isDeepStrictEqual(saved.permit, input.permit)) throw new Error("authority_permit_conflict");
			if (
				!("transferId" in receipt) ||
				receipt.request.newOwnerId !== observation.identity.ownerId ||
				receipt.request.expectedOwnerId !== input.expectedOwnerId ||
				receipt.request.expectedEpoch !== input.expectedEpoch ||
				receipt.request.expectedRevision !== input.expectedRevision ||
				receipt.authority.expiresAt !== input.expiresAt
			)
				throw new Error("identity_conflict");
			return receipt;
		}
		const { authority: current, admission, canceled } = snapshot;
		if (
			current.hostId !== observation.identity.hostId ||
			current.ownerId !== input.expectedOwnerId ||
			current.ownerId === observation.identity.ownerId ||
			current.engineEpoch !== input.expectedEpoch ||
			current.ownershipRevision !== input.expectedRevision
		)
			throw new Error("ownership_conflict");
		const revocation = await this.store.readRevocation({
			dataHomeId: observation.identity.dataHomeId,
			hostId: current.hostId,
			ownerId: current.ownerId,
		});
		if (
			!revocation ||
			revocation.identity.dataHomeId !== observation.identity.dataHomeId ||
			revocation.identity.hostId !== current.hostId ||
			revocation.identity.ownerId !== current.ownerId
		)
			throw new Error("owner_not_revoked");
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
		return this.store.commit({
			permit: input.permit,
			requestBytes,
			authorityBytes: JSON.stringify(receipt.authority),
			receipt,
			observation,
			revocation,
		});
	}
	private assertCancellation(snapshot: OwnershipSnapshot, savedPermissions?: string[]) {
		if (!snapshot.canceled) return;
		if (snapshot.admission.state !== "closed") throw new Error("canceled_admission_open");
		if (savedPermissions && (savedPermissions.length !== 1 || savedPermissions[0] !== "execution.cancel")) {
			throw new Error("cancellation_requires_successor_authority");
		}
	}
}
