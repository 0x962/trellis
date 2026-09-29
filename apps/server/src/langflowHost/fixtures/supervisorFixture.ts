import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeliveryAuthorityV1 } from "../../langflowContracts";
import { AdmissionStateV1Schema, DeliveryAuthorityV1Schema } from "../../langflowContracts";
import admissionFixture from "../../langflowContracts/fixtures/admission.json";
import authorityFixture from "../../langflowContracts/fixtures/authority.json";
import type {
	AuthorityCommit,
	OwnerRevocation,
	SidecarIdentity,
	SidecarObservation,
	SupervisorDependencies,
} from "../contracts";
import { LangflowSupervisor } from "../supervisor";
import { manifest } from "./manifest";

export async function supervisorFixture() {
	const home = await mkdtemp(join(tmpdir(), "trellis-langflow-supervisor-"));
	const trace: string[] = [];
	const processes = new Map<string, SidecarObservation>();
	const revocations = new Map<string, OwnerRevocation>();
	const receipts = new Map<string, AuthorityCommit>();
	let authority = DeliveryAuthorityV1Schema.parse(authorityFixture);
	let admission = AdmissionStateV1Schema.parse({
		state: "open",
		receipt: { ...admissionFixture, engineEpoch: authority.engineEpoch },
	});
	let challengeOverride: string | null = null;
	let now = new Date("2026-09-29T10:00:00.000Z");
	const dependencies: SupervisorDependencies = {
		now: () => now,
		driver: {
			async start({ identity }) {
				trace.push("start");
				processes.set(identity.instanceId, {
					identity,
					challenge: "",
					state: "running",
					health: "healthy",
					endpoint: "http://127.0.0.1:12345",
				});
			},
			async observe({ identity, challenge }) {
				trace.push("observe");
				const process = processes.get(identity.instanceId);
				return {
					identity,
					state: "absent",
					health: "unknown",
					endpoint: null,
					...process,
					challenge: challengeOverride ?? challenge,
				};
			},
			async stop(identity) {
				trace.push("stop");
				processes.get(identity.instanceId)!.state = "exited";
			},
		},
		authority: {
			async revokeOwner({ identity, observationId }) {
				trace.push("revoke");
				const receipt = { id: crypto.randomUUID(), identity, observationId };
				revocations.set(identity.ownerId, receipt);
				return receipt;
			},
			async readRevocation({ ownerId }) {
				return revocations.get(ownerId) ?? null;
			},
			async readReceipt({ executionId, requestId }) {
				return receipts.get(`${executionId}/${requestId}`) ?? null;
			},
			async read() {
				return structuredClone({ authority, admission });
			},
			async commit(input) {
				const { receipt } = input;
				if (receipt.request.expectedRevision !== authority.ownershipRevision) throw new Error("ownership_conflict");
				if (revocations.has(receipt.authority.ownerId)) throw new Error("owner_revoked");
				if ("transferId" in receipt && !revocations.has(receipt.request.expectedOwnerId)) {
					throw new Error("owner_not_revoked");
				}
				authority = receipt.authority;
				if ("transferId" in receipt) admission = receipt.admission;
				receipts.set(`${receipt.request.executionId}/${receipt.request.requestId}`, structuredClone(input));
				return structuredClone(receipt);
			},
		},
	};
	const open = () => LangflowSupervisor.open({ home, hostId: "host-1", manifest, dependencies });
	return {
		home,
		trace,
		processes,
		revocations,
		receipts,
		dependencies,
		open,
		authority: () => structuredClone(authority),
		bind(identity: SidecarIdentity) {
			authority = { ...authority, ownerId: identity.ownerId };
		},
		observeChallenge(value: string | null) {
			challengeOverride = value;
		},
		setTime(value: string) {
			now = new Date(value);
		},
		authorize(capability: DeliveryAuthorityV1) {
			if (
				revocations.has(capability.ownerId) ||
				capability.capabilityId !== authority.capabilityId ||
				capability.ownerId !== authority.ownerId ||
				Date.parse(capability.expiresAt) <= now.getTime()
			)
				throw new Error("authority_denied");
		},
		async remove() {
			await rm(home, { recursive: true, force: true });
		},
	};
}
