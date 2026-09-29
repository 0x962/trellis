import { isDeepStrictEqual } from "node:util";
import type { AdmissionStateV1 } from "../../langflowContracts";
import type { RenewalInput, TakeoverInput } from "../authority";
import { renewalCommit } from "../authority/components/renewalCommit";
import { takeoverCommit } from "../authority/components/takeoverCommit";
import type { AuthorityPort, InitialBindingPort } from "../contracts";
import type { InitialAuthorityIssuer } from "../initialAuthority";
import type { DispatchReceiptArchive } from "../receiptArchive";
import type { LangflowSupervisor } from "../supervisor";

export class InitialAuthorityRecovery {
	constructor(
		private readonly supervisor: Pick<LangflowSupervisor, "withHealthyEngine">,
		private readonly issuer: InitialAuthorityIssuer,
		private readonly store: AuthorityPort & InitialBindingPort,
		private readonly archive: DispatchReceiptArchive,
	) {}

	async recover(input: (RenewalInput | TakeoverInput) & { canceled: boolean; admission: AdmissionStateV1 }) {
		return this.supervisor.withHealthyEngine(async (observation) => {
			const initial = this.issuer.readInitial(input.executionId);
			if (!initial || input.admission.state !== "closed") throw new Error("initial_recovery_unavailable");
			const original = initial.authority;
			if (
				("expectedOwnerId" in input &&
					(original.ownerId !== input.expectedOwnerId || original.engineEpoch !== input.expectedEpoch)) ||
				original.ownershipRevision !== input.expectedRevision ||
				original.hostId !== observation.identity.hostId ||
				initial.observation.identity.dataHomeId !== observation.identity.dataHomeId
			)
				throw new Error("initial_recovery_identity_conflict");
			const saved = await this.store.readReceipt(input);
			if (saved) {
				if (
					saved.initialRecordBytes !== initial.sourceBytes ||
					!isDeepStrictEqual(saved.permit, input.permit) ||
					saved.receipt.authority.ownerId !== observation.identity.ownerId ||
					saved.receipt.authority.expiresAt !== input.expiresAt
				)
					throw new Error("initial_recovery_replay_conflict");
				return saved;
			}
			this.archive.writeAuthority({
				authorityBytes: initial.authorityBytes,
				issuanceReceiptId: initial.issuanceReceiptId,
			});
			const snapshot = { authority: original, admission: input.admission, canceled: input.canceled };
			if (!("expectedOwnerId" in input)) {
				if (!isDeepStrictEqual(initial.observation.identity, observation.identity)) {
					throw new Error("initial_recovery_identity_conflict");
				}
				return this.store.recoverInitialBinding({
					initialRecordBytes: initial.sourceBytes,
					takeover: renewalCommit(observation, input, snapshot),
				});
			}
			const revocation = await this.store.readRevocation({
				dataHomeId: observation.identity.dataHomeId,
				hostId: original.hostId,
				ownerId: original.ownerId,
			});
			if (
				!revocation ||
				!isDeepStrictEqual(revocation.identity, initial.observation.identity) ||
				original.ownerId === observation.identity.ownerId
			) {
				throw new Error("initial_recovery_owner_not_revoked");
			}
			const takeover = takeoverCommit(observation, input, snapshot, revocation);
			return this.store.recoverInitialBinding({ initialRecordBytes: initial.sourceBytes, takeover });
		});
	}
}
