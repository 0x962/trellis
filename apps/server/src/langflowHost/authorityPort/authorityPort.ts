import { isDeepStrictEqual } from "node:util";
import { authorityControl, readTakeoverStops, recoverInitialBinding } from "../../db/queries/langflowExecution";
import type { Tx } from "../../db/tx";
import { readIssuedAuthority } from "../authority/issuedBytes";
import { authorityPermitBinding } from "../authorityPermit";
import type { AuthorityCommit, AuthorityPort, InitialBindingPort, SidecarIdentity } from "../contracts";
import type { DispatchEffects } from "../dispatchEffects";
import { type HostControlIdentity, LangflowHostControl } from "../hostControl";
import type { DispatchReceiptArchive } from "../receiptArchive";

export type AuthorityPortInput = {
	control: { identity: HostControlIdentity; gate: Pick<DispatchEffects, "read"> };
	archive: DispatchReceiptArchive;
	newTx<T>(operation: (tx: Tx) => Promise<T>): Promise<T>;
};

export function createAuthorityPort(input: AuthorityPortInput): AuthorityPort & InitialBindingPort {
	const identity = structuredClone(input.control.identity);

	function currentHome() {
		if (!isDeepStrictEqual(LangflowHostControl.readIdentity(identity.home), identity)) {
			throw new Error("authority_control_identity_changed");
		}
		if (input.control.gate.read().dataHomeId !== identity.dataHomeId) {
			throw new Error("authority_control_home_mismatch");
		}
	}

	function scope(value: Pick<SidecarIdentity, "dataHomeId" | "hostId">) {
		currentHome();
		if (value.dataHomeId !== identity.dataHomeId || value.hostId !== identity.hostId) {
			throw new Error("authority_control_home_mismatch");
		}
	}

	function issuedFor(commit: AuthorityCommit) {
		scope(commit.observation.identity);
		const issued = readIssuedAuthority(commit);
		if (
			issued.authority.hostId !== identity.hostId ||
			issued.authority.ownerId !== commit.observation.identity.ownerId ||
			commit.receipt.request.supervisorObservationId !== commit.observation.id
		)
			throw new Error("authority_observation_mismatch");
		return issued;
	}

	function archive(commit: AuthorityCommit) {
		const issued = issuedFor(commit);
		input.archive.writeAuthority({
			authorityBytes: issued.authorityBytes,
			issuanceReceiptId: issued.issuanceReceiptId,
		});
		return commit;
	}

	function assertCommit(request: AuthorityCommit) {
		issuedFor(request);
		const expected = authorityPermitBinding(
			{ ...request.receipt.request, expiresAt: request.receipt.authority.expiresAt },
			request.receipt.authority.engineJobId,
		);
		const entry = input.control.gate.read().permits.find((item) => item.permit.id === request.permit.id);
		if (
			!entry ||
			entry.terminal !== null ||
			!isDeepStrictEqual(entry.permit, request.permit) ||
			!isDeepStrictEqual(entry.permit.binding, expected) ||
			entry.permit.dataHomeId !== identity.dataHomeId
		)
			throw new Error("authority_permit_not_held");
		if (request.revocation) scope(request.revocation.identity);
	}

	async function retainedStops(tx: Tx, request: AuthorityCommit): Promise<AuthorityCommit> {
		if (!("transferId" in request.receipt)) return request;
		const saved = await authorityControl.readReceipt(tx, request.receipt.request);
		if (saved) {
			if (!isDeepStrictEqual(saved, { ...request, takeoverStops: saved.takeoverStops })) {
				throw new Error("authority_takeover_replay_conflict");
			}
			return saved;
		}
		const stops = await readTakeoverStops(tx, request.receipt.request);
		if (!stops.ready) throw new Error("authority_takeover_stops_pending");
		return { ...request, takeoverStops: { sourceBytes: stops.sourceBytes, sourceDigest: stops.sourceDigest } };
	}

	return {
		async revokeOwner(request) {
			scope(request.identity);
			return input.newTx((tx) => authorityControl.revokeOwner(tx, request));
		},
		async readRevocation(request) {
			scope(request);
			return input.newTx((tx) => authorityControl.readRevocation(tx, request));
		},
		async readReceipt(request) {
			currentHome();
			const saved = await input.newTx((tx) => authorityControl.readReceipt(tx, request));
			return saved === null ? null : archive(saved);
		},
		async read(executionId) {
			currentHome();
			const saved = await input.newTx((tx) => authorityControl.read(tx, { executionId }));
			if (saved.authority.hostId !== identity.hostId) throw new Error("authority_control_home_mismatch");
			return saved;
		},
		async recoverInitialBinding(request) {
			assertCommit(request.takeover);
			const saved = await input.newTx(async (tx) =>
				recoverInitialBinding(tx, {
					initialRecordBytes: request.initialRecordBytes,
					takeover: await retainedStops(tx, { ...request.takeover, initialRecordBytes: request.initialRecordBytes }),
				}),
			);
			archive(saved);
			return saved;
		},

		async commit(request) {
			assertCommit(request);
			const saved = await input.newTx(async (tx) => authorityControl.commit(tx, await retainedStops(tx, request)));
			return archive(saved).receipt;
		},
	};
}
