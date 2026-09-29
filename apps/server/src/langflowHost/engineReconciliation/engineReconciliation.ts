import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { lockHome } from "../../homeLock";
import { protocolDigest } from "../../langflowContracts";
import type { DispatchEffects } from "../dispatchEffects";
import type { DispatchBlock } from "../dispatchGate";
import { createEngineClient, type EngineClientDependencies, type EngineRequest } from "../engineClient";
import { type HostControlIdentity, LangflowHostControl } from "../hostControl";
import { ReceiptObjectStore } from "../objectStore";
import type { LangflowSupervisor } from "../supervisor";
import { readReconciliationIssuer } from "./credential";
import { type EngineLease, EngineLeaseSchema, LiveEngineIdentitySchema, parseEngineLeaseRecord } from "./schema";

export type EngineReconciliationInput = {
	control: { identity: HostControlIdentity; gate: Pick<DispatchEffects, "read"> };
	supervisor: Pick<LangflowSupervisor, "withHealthyEngine">;
	dependencies?: Partial<EngineClientDependencies>;
};

export class EngineReconciliation {
	private readonly directory: string;
	private readonly objects: ReceiptObjectStore;

	constructor(private readonly input: EngineReconciliationInput) {
		this.directory = join(LangflowHostControl.directory(input.control.identity.home), "engine-reconciliation");
		this.objects = new ReceiptObjectStore(this.directory);
	}

	async acquire(block: DispatchBlock, signal: AbortSignal) {
		this.assertClosed(block);
		const leaseBytes = await this.input.supervisor.withHealthyEngine(async (observation) => {
			this.assertClosed(block);
			const key = this.key(block);
			const lock = lockHome(this.directory, "server", null);
			try {
				const saved = this.objects.findBinding(key);
				if (saved) return this.objects.read(saved);
				const lease = EngineLeaseSchema.parse({
					version: 1,
					id: crypto.randomUUID(),
					block: {
						id: block.id,
						dataHomeId: block.dataHomeId,
						generation: block.generation,
						requestId: block.requestId,
					},
					identity: observation.identity,
					issuerDigest: protocolDigest(readReconciliationIssuer(this.input.control.identity)),
				});
				if (lease.identity.dataHomeId !== block.dataHomeId) throw new Error("engine_reconciliation_home_conflict");
				const bytes = JSON.stringify(lease);
				this.objects.bind(key, this.objects.write(bytes));
				return bytes;
			} finally {
				lock.release();
			}
		});
		const response = await this.request(leaseBytes, {
			method: "POST",
			path: "/trellis-v1/reconciliation-leases",
			body: JSON.stringify({ leaseBytes }),
			signal,
		});
		if (response === null) return null;
		this.assertClosed(block);
		const record = this.record(response, leaseBytes);
		if (record.state !== "active") throw new Error("engine_reconciliation_lease_released");
		return { leaseBytes, record, sourceBytes: response, sourceDigest: protocolDigest(response) };
	}

	async read(block: DispatchBlock, signal: AbortSignal) {
		this.assertClosed(block);
		const leaseBytes = this.leaseBytes(block);
		const lease = EngineLeaseSchema.parse(JSON.parse(leaseBytes));
		const sourceBytes = await this.request(leaseBytes, {
			method: "GET",
			path: `/trellis-v1/reconciliation-leases/${lease.id}`,
			signal,
		});
		if (sourceBytes === null) return null;
		const record = this.record(sourceBytes, leaseBytes);
		if (record.state !== "active") throw new Error("engine_reconciliation_lease_released");
		const currentBytes = await this.request(leaseBytes, {
			method: "GET",
			path: `/trellis-v1/reconciliation-leases/${lease.id}/identity`,
			signal,
		});
		if (currentBytes === null) return null;
		const current = LiveEngineIdentitySchema.parse(JSON.parse(currentBytes));
		if (!isDeepStrictEqual(current, record.identity)) throw new Error("engine_reconciliation_identity_changed");
		this.assertClosed(block);
		return { leaseBytes, record, sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
	}

	async release(block: DispatchBlock, reconciliationReceiptId: string, signal: AbortSignal) {
		this.assertHome();
		const state = this.input.control.gate.read();
		const receipt = state.reconciliations.find((item) => item.id === reconciliationReceiptId);
		if (!receipt || !isDeepStrictEqual(receipt.block, block) || state.generation <= block.generation) {
			throw new Error("engine_reconciliation_gate_not_released");
		}
		const leaseBytes = this.leaseBytes(block);
		const lease = EngineLeaseSchema.parse(JSON.parse(leaseBytes));
		const acknowledgementBytes = JSON.stringify({
			version: 1,
			leaseId: lease.id,
			blockId: block.id,
			dataHomeId: block.dataHomeId,
			generation: block.generation,
			reconciliationReceiptId,
		});
		this.objects.bind(JSON.stringify(["acknowledgement", lease.id]), this.objects.write(acknowledgementBytes));
		const sourceBytes = await this.request(leaseBytes, {
			method: "POST",
			path: `/trellis-v1/reconciliation-leases/${lease.id}/release`,
			body: JSON.stringify({ leaseBytes, acknowledgementBytes }),
			signal,
		});
		if (sourceBytes === null) return null;
		const record = this.record(sourceBytes, leaseBytes);
		if (record.state !== "released" || record.acknowledgementBytes !== acknowledgementBytes) {
			throw new Error("engine_reconciliation_release_conflict");
		}
		return { record, sourceBytes, sourceDigest: protocolDigest(sourceBytes) };
	}

	private assertHome() {
		const identity = this.input.control.identity;
		if (!isDeepStrictEqual(LangflowHostControl.readIdentity(identity.home), identity)) {
			throw new Error("engine_reconciliation_home_changed");
		}
	}

	private assertClosed(block: DispatchBlock) {
		this.assertHome();
		const state = this.input.control.gate.read();
		if (state.dataHomeId !== block.dataHomeId || !isDeepStrictEqual(state.block, block)) {
			throw new Error("engine_reconciliation_block_changed");
		}
		if (state.permits.some((entry) => !entry.terminal)) throw new Error("engine_reconciliation_effects_pending");
	}

	private key(block: DispatchBlock) {
		return JSON.stringify([block.dataHomeId, block.id, block.generation, block.requestId]);
	}

	private leaseBytes(block: DispatchBlock) {
		return this.objects.read(this.objects.readBinding(this.key(block)));
	}

	private record(sourceBytes: string, leaseBytes: string) {
		const record = parseEngineLeaseRecord(sourceBytes, leaseBytes);
		this.objects.bind(JSON.stringify(["receipt", record.receiptId]), this.objects.write(sourceBytes));
		return record;
	}

	private request(leaseBytes: string, request: EngineRequest) {
		return this.input.supervisor.withHealthyEngine(async (observation) => {
			this.assertHome();
			request.signal.throwIfAborted();
			const lease: EngineLease = EngineLeaseSchema.parse(JSON.parse(leaseBytes));
			const issuer = readReconciliationIssuer(this.input.control.identity);
			if (!isDeepStrictEqual(lease.identity, observation.identity) || lease.issuerDigest !== protocolDigest(issuer)) {
				throw new Error("engine_reconciliation_instance_changed");
			}
			const fetcher = this.input.dependencies?.fetch ?? fetch;
			const client = createEngineClient({
				endpoint: observation.endpoint,
				authenticationFile: join(
					this.input.control.identity.home,
					"langflow",
					"secrets",
					`${lease.identity.instanceId}.token`,
				),
				dependencies: {
					...this.input.dependencies,
					fetch: (url, init) => {
						const headers = new Headers(init?.headers);
						headers.set("X-Trellis-Reconciliation-Issuer", issuer);
						return fetcher(url, { ...init, headers });
					},
				},
			});
			const response = await client.request(request);
			if (response.state !== "received" || response.status !== 200) return null;
			return new TextDecoder("utf-8", { fatal: true }).decode(response.bytes);
		});
	}
}
