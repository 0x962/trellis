import { link, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type {
	DeliveryAuthorityV1,
	NativeLaunchProvenanceV1,
	RenewalReceiptV1,
	TakeoverReceiptV1,
} from "../../../../apps/server/src/langflowContracts/index.ts";
import {
	DeliveryAuthorityV1Schema,
	NativeLaunchProvenanceV1Schema,
	protocolDigest,
	RenewalReceiptV1Schema,
	TakeoverReceiptV1Schema,
} from "../../../../apps/server/src/langflowContracts/index.ts";

type SupervisorObservation = {
	id: string;
	executionId: string;
	ownerId: string;
	engineEpoch: number;
	ownershipRevision: number;
	agentRunId: string;
	attemptId: string;
	process: RuntimeProcessStatus;
	observedAt: string;
};

type OwnerRevocation = {
	id: string;
	executionId: string;
	ownerId: string;
	capabilityId: string;
	observationId: string;
	revokedAt: string;
};

type AuthorityState = {
	sequence: number;
	authority: DeliveryAuthorityV1;
	provenance: NativeLaunchProvenanceV1;
	observations: SupervisorObservation[];
	revocations: OwnerRevocation[];
	takeovers: TakeoverReceiptV1[];
	renewals: RenewalReceiptV1[];
};

const bytes = (value: unknown) => JSON.stringify(value);

export class DurableAuthorityFixture {
	commitBoundary?: (phase: "before_commit" | "after_commit", sequence: number) => Promise<void>;
	private constructor(private readonly directory: string) {}

	static async create(directory: string, authority: DeliveryAuthorityV1, provenance: NativeLaunchProvenanceV1) {
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const fixture = new DurableAuthorityFixture(directory);
		const parsedAuthority = DeliveryAuthorityV1Schema.parse(authority);
		const parsedProvenance = NativeLaunchProvenanceV1Schema.parse(provenance);
		if (parsedAuthority.executionId !== parsedProvenance.request.executionId) throw new Error("execution_mismatch");
		await fixture.commit({
			sequence: 1,
			authority: parsedAuthority,
			provenance: parsedProvenance,
			observations: [],
			revocations: [],
			takeovers: [],
			renewals: [],
		});
		return fixture;
	}

	static open(directory: string) {
		return new DurableAuthorityFixture(directory);
	}

	async current() {
		return structuredClone((await this.read()).authority);
	}

	async provenance() {
		return structuredClone((await this.read()).provenance);
	}

	async trace() {
		return structuredClone(await this.read());
	}

	async authorize(
		ownerId: string,
		capabilityId: string,
		permission: DeliveryAuthorityV1["permissions"][number],
		at: string,
	) {
		const state = await this.read();
		const authority = state.authority;
		if (authority.ownerId !== ownerId) throw new Error("stale_owner");
		if (authority.capabilityId !== capabilityId) throw new Error("stale_owner");
		if (
			state.revocations.some((revocation) => revocation.ownerId === ownerId && revocation.capabilityId === capabilityId)
		)
			throw new Error("stale_owner");
		if (Date.parse(at) >= Date.parse(authority.expiresAt)) throw new Error("authority_expired");
		if (!authority.permissions.includes(permission)) throw new Error("stale_owner");
		return structuredClone(authority);
	}

	async observe(input: Omit<SupervisorObservation, "process"> & { process: RuntimeProcessStatus }) {
		return this.mutate((state) => {
			const authority = state.authority;
			if (
				authority.executionId !== input.executionId ||
				authority.ownerId !== input.ownerId ||
				authority.engineEpoch !== input.engineEpoch ||
				authority.ownershipRevision !== input.ownershipRevision
			)
				throw new Error("stale_owner");
			if (
				input.process.id !== input.attemptId ||
				state.provenance.attemptId !== input.attemptId ||
				state.provenance.agentRunId !== input.agentRunId
			)
				throw new Error("attempt_mismatch");
			state.observations.push(structuredClone(input));
			return input.id;
		});
	}

	async revoke(input: OwnerRevocation) {
		return this.mutate((state) => {
			const authority = state.authority;
			const observation = state.observations.find((value) => value.id === input.observationId);
			if (
				authority.executionId !== input.executionId ||
				authority.ownerId !== input.ownerId ||
				authority.capabilityId !== input.capabilityId ||
				observation?.ownerId !== input.ownerId ||
				observation.engineEpoch !== authority.engineEpoch ||
				observation.ownershipRevision !== authority.ownershipRevision
			)
				throw new Error("stale_owner");
			state.revocations.push(structuredClone(input));
			return input.id;
		});
	}

	async takeover(input: {
		requestId: string;
		expectedOwnerId: string;
		expectedEpoch: number;
		expectedRevision: number;
		newOwnerId: string;
		capabilityId: string;
		observationId: string;
		revocationId: string;
		transferId: string;
		committedAt: string;
		expiresAt: string;
	}): Promise<TakeoverReceiptV1> {
		return this.mutate((state) => {
			const current = state.authority;
			if (
				current.ownerId !== input.expectedOwnerId ||
				current.engineEpoch !== input.expectedEpoch ||
				current.ownershipRevision !== input.expectedRevision
			)
				throw new Error("stale_owner");
			const observation = state.observations.find((value) => value.id === input.observationId);
			if (
				observation?.ownerId !== input.expectedOwnerId ||
				observation.engineEpoch !== input.expectedEpoch ||
				observation.ownershipRevision !== input.expectedRevision
			)
				throw new Error("observation_mismatch");
			const revocation = state.revocations.find((value) => value.id === input.revocationId);
			if (
				revocation?.ownerId !== input.expectedOwnerId ||
				revocation.capabilityId !== current.capabilityId ||
				revocation.observationId !== observation.id
			)
				throw new Error("revocation_mismatch");
			const request = {
				version: 1 as const,
				executionId: current.executionId,
				requestId: input.requestId,
				expectedOwnerId: input.expectedOwnerId,
				expectedEpoch: input.expectedEpoch,
				expectedRevision: input.expectedRevision,
				newOwnerId: input.newOwnerId,
				supervisorObservationId: observation.id,
				priorOwnerRevocationId: revocation.id,
			};
			const receipt = TakeoverReceiptV1Schema.parse({
				version: 1,
				request,
				requestDigest: protocolDigest(bytes(request)),
				transferId: input.transferId,
				committedAt: input.committedAt,
				authority: {
					...current,
					ownerId: input.newOwnerId,
					engineEpoch: current.engineEpoch + 1,
					ownershipRevision: current.ownershipRevision + 1,
					capabilityId: input.capabilityId,
					issuedAt: input.committedAt,
					expiresAt: input.expiresAt,
				},
				admission: { state: "closed", barrierId: "barrier-native-lifecycle" },
			});
			state.authority = receipt.authority;
			state.takeovers.push(receipt);
			return receipt;
		});
	}

	async renew(input: {
		requestId: string;
		expectedRevision: number;
		observationId: string;
		renewalId: string;
		capabilityId: string;
		issuedAt: string;
		expiresAt: string;
	}): Promise<RenewalReceiptV1> {
		return this.mutate((state) => {
			const current = state.authority;
			if (current.ownershipRevision !== input.expectedRevision) throw new Error("stale_owner");
			const observation = state.observations.find((value) => value.id === input.observationId);
			if (
				observation?.ownerId !== current.ownerId ||
				observation.engineEpoch !== current.engineEpoch ||
				observation.ownershipRevision !== current.ownershipRevision
			)
				throw new Error("observation_mismatch");
			const request = {
				version: 1 as const,
				requestId: input.requestId,
				executionId: current.executionId,
				ownerId: current.ownerId,
				engineEpoch: current.engineEpoch,
				expectedRevision: input.expectedRevision,
				supervisorObservationId: observation.id,
			};
			const receipt = RenewalReceiptV1Schema.parse({
				version: 1,
				request,
				requestDigest: protocolDigest(bytes(request)),
				renewalId: input.renewalId,
				authority: {
					...current,
					ownershipRevision: current.ownershipRevision + 1,
					capabilityId: input.capabilityId,
					issuedAt: input.issuedAt,
					expiresAt: input.expiresAt,
				},
			});
			state.authority = receipt.authority;
			state.renewals.push(receipt);
			return receipt;
		});
	}

	private async mutate<T>(change: (state: AuthorityState) => T | Promise<T>) {
		const state = await this.read();
		const result = await change(state);
		state.sequence += 1;
		try {
			await this.commit(state);
			return result;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("stale_owner");
			throw error;
		}
	}

	private async read() {
		const sequences = (await readdir(this.directory))
			.flatMap((name) => /^authority-(\d+)\.json$/.exec(name)?.[1] ?? [])
			.map(Number);
		const sequence = Math.max(...sequences);
		return JSON.parse(await readFile(join(this.directory, `authority-${sequence}.json`), "utf8")) as AuthorityState;
	}

	private async commit(state: AuthorityState) {
		const path = join(this.directory, `authority-${state.sequence}.json`);
		const temporary = join(this.directory, `authority-${state.sequence}-${crypto.randomUUID()}.next`);
		await writeFile(temporary, bytes(state), { mode: 0o600 });
		try {
			await this.commitBoundary?.("before_commit", state.sequence);
			await link(temporary, path);
			await this.commitBoundary?.("after_commit", state.sequence);
		} finally {
			await unlink(temporary);
		}
	}
}
