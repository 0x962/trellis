import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { lockHome } from "../../homeLock";
import { type DeliveryAuthorityV1, DeliveryAuthorityV1Schema } from "../../langflowContracts";
import type { LiveOwnership } from "../contracts";
import type { DispatchEffects } from "../dispatchEffects";
import { type HostControlIdentity, LangflowHostControl } from "../hostControl";
import type { DispatchReceiptArchive } from "../receiptArchive";
import { ReceiptObjectStore } from "../receiptArchive/objectStore/objectStore";
import type { LangflowSupervisor } from "../supervisor";
import {
	type InitialAuthorityInput,
	InitialAuthorityInputSchema,
	type InitialAuthorityRecord,
	InitialAuthorityRecordSchema,
} from "./schema/schema";

type Control = { identity: HostControlIdentity; gate: Pick<DispatchEffects, "recoverPermit"> };

export class InitialAuthorityIssuer {
	private readonly directory: string;
	private readonly records: ReceiptObjectStore;

	constructor(
		private readonly control: Control,
		private readonly supervisor: Pick<LangflowSupervisor, "withHealthyEngine">,
		private readonly archive: DispatchReceiptArchive,
	) {
		this.directory = join(LangflowHostControl.directory(control.identity.home), "initial-authorities");
		this.records = new ReceiptObjectStore(this.directory);
	}

	async issue(input: InitialAuthorityInput) {
		const request = InitialAuthorityInputSchema.parse(input);
		return this.supervisor.withHealthyEngine(async (observation) => {
			this.assertScope(request, observation);
			const lock = lockHome(this.directory, "server", null);
			try {
				const key = JSON.stringify(["initial", this.control.identity.dataHomeId, request.executionId]);
				const savedId = this.records.findBinding(key);
				let record: InitialAuthorityRecord;
				if (savedId) {
					record = InitialAuthorityRecordSchema.parse(JSON.parse(this.records.read(savedId)));
					if (!isDeepStrictEqual(record.input, request)) throw new Error("initial_authority_request_conflict");
					if (!isDeepStrictEqual(record.observation.identity, observation.identity)) {
						throw new Error("initial_authority_owner_changed");
					}
				} else {
					const authority = DeliveryAuthorityV1Schema.parse({
						version: 1,
						executionId: request.executionId,
						publicationId: request.publicationId,
						engineJobId: request.correlation.engineJobId,
						engineEpoch: 1,
						hostId: observation.identity.hostId,
						projectId: request.projectId,
						publicationDigest: request.publicationDigest,
						ownerId: observation.identity.ownerId,
						ownershipRevision: 1,
						capabilityId: crypto.randomUUID(),
						permissions: request.permissions,
						issuedAt: observation.observedAt,
						expiresAt: request.expiresAt,
					});
					record = InitialAuthorityRecordSchema.parse({
						version: 1,
						issuanceReceiptId: crypto.randomUUID(),
						input: request,
						observation,
						authorityBytes: JSON.stringify(authority),
					});
					this.records.bind(key, this.records.write(JSON.stringify(record)));
				}
				return this.finish(record);
			} finally {
				lock.release();
			}
		});
	}

	readInitial(executionId: string) {
		const key = JSON.stringify(["initial", this.control.identity.dataHomeId, executionId]);
		const id = this.records.findBinding(key);
		if (!id) return null;
		const record = InitialAuthorityRecordSchema.parse(JSON.parse(this.records.read(id)));
		if (
			record.input.executionId !== executionId ||
			record.observation.identity.dataHomeId !== this.control.identity.dataHomeId ||
			record.observation.identity.hostId !== this.control.identity.hostId
		) {
			throw new Error("initial_authority_home_conflict");
		}
		return { id, ...record, authority: DeliveryAuthorityV1Schema.parse(JSON.parse(record.authorityBytes)) };
	}

	readAuthorityBytes(authority: DeliveryAuthorityV1): string {
		return this.archive.readAuthorityBytes(authority);
	}

	private finish(record: InitialAuthorityRecord) {
		if (record.observation.identity.dataHomeId !== this.control.identity.dataHomeId) {
			throw new Error("initial_authority_home_conflict");
		}
		const receipt = this.archive.writeAuthority({
			authorityBytes: record.authorityBytes,
			issuanceReceiptId: record.issuanceReceiptId,
		});
		return { ...receipt, observation: record.observation, correlation: record.input.correlation };
	}

	private assertScope(input: InitialAuthorityInput, observation: LiveOwnership) {
		const correlation = input.correlation;
		const identity = this.control.identity;
		if (
			observation.identity.dataHomeId !== identity.dataHomeId ||
			observation.identity.hostId !== identity.hostId ||
			input.hostId !== identity.hostId ||
			correlation.hostId !== identity.hostId ||
			correlation.executionId !== input.executionId ||
			correlation.publicationId !== input.publicationId ||
			correlation.submissionDigest !== input.submissionDigest ||
			Date.parse(input.expiresAt) <= Date.parse(observation.observedAt) ||
			new Set(input.permissions).size !== input.permissions.length
		)
			throw new Error("initial_authority_scope_conflict");
		const entry = this.control.gate.recoverPermit(input.permit.binding);
		if (
			!entry ||
			entry.terminal ||
			!isDeepStrictEqual(entry.permit, input.permit) ||
			input.permit.dataHomeId !== identity.dataHomeId ||
			input.permit.binding.executionId !== input.executionId ||
			!["admission", "recovery"].includes(input.permit.binding.kind) ||
			(input.permit.binding.jobId !== null && input.permit.binding.jobId !== correlation.engineJobId)
		)
			throw new Error("initial_authority_permit_conflict");
	}
}
