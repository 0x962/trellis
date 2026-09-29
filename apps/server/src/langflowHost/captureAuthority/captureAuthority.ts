import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../langflowContracts";
import type { DispatchBlock } from "../dispatchGate";
import { DispatchStore } from "../dispatchGate/store/store";
import { createEngineClient, type EngineClientOptions } from "../engineClient";
import { LangflowHostControl } from "../hostControl";
import type { LangflowSupervisor } from "../supervisor";
import { readCaptureIssuer } from "./credential/credential";
import {
	type CaptureGrant,
	CaptureGrantSchema,
	type CaptureReceipt,
	CaptureReceiptSchema,
	type CaptureRecord,
} from "./schema/schema";

export class CaptureAuthority {
	private readonly store: DispatchStore;

	constructor(
		private readonly control: LangflowHostControl,
		private readonly supervisor: Pick<LangflowSupervisor, "withHealthyEngine">,
		private readonly transport: Omit<EngineClientOptions, "endpoint">,
	) {
		this.store = new DispatchStore(
			join(LangflowHostControl.directory(control.identity.home), "dispatch"),
			control.identity.dataHomeId,
		);
	}

	async issue(input: { block: DispatchBlock; boundaryReceiptId: string }): Promise<CaptureRecord> {
		return this.supervisor.withHealthyEngine(async ({ identity }) => {
			if (identity.hostId !== this.control.identity.hostId || identity.dataHomeId !== this.control.identity.dataHomeId)
				throw new Error("capture_identity_mismatch");
			return this.store.mutate((state) => {
				if (!isDeepStrictEqual(state.block, input.block) || input.block.reason.kind !== "capture")
					throw new Error("capture_block_mismatch");
				if (state.permits.some((entry) => !entry.terminal)) throw new Error("dispatch_effects_pending");
				const prior = state.captureGrants.find((entry) => this.grant(entry).block.id === input.block.id);
				if (prior) {
					const grant = this.grant(prior);
					if (!isDeepStrictEqual(grant.identity, identity) || grant.boundaryReceiptId !== input.boundaryReceiptId)
						throw new Error("capture_grant_conflict");
					return structuredClone(prior);
				}
				const grant = CaptureGrantSchema.parse({
					version: 1,
					id: crypto.randomUUID(),
					block: input.block,
					identity,
					snapshotId: input.block.reason.snapshotId,
					boundaryReceiptId: input.boundaryReceiptId,
				});
				const record: CaptureRecord = { grantBytes: JSON.stringify(grant), phase: "issued", receipt: null };
				state.captureGrants.push(record);
				return structuredClone(record);
			});
		});
	}

	read(id: string): CaptureRecord | null {
		return this.store.read().captureGrants.find((entry) => this.grant(entry).id === id) ?? null;
	}

	async commit(grantBytes: string, signal: AbortSignal) {
		const grant = CaptureGrantSchema.parse(JSON.parse(grantBytes));
		this.current(grantBytes);
		const record = this.read(grant.id);
		if (record?.phase === "revoking" || record?.phase === "revoked") throw new Error("capture_grant_revoked");
		return this.request(grantBytes, "POST", "", signal);
	}

	async lookup(grantBytes: string, signal: AbortSignal) {
		const grant = CaptureGrantSchema.parse(JSON.parse(grantBytes));
		this.current(grantBytes);
		return this.request(grantBytes, "GET", `/${grant.id}`, signal);
	}

	async revoke(grantBytes: string, signal: AbortSignal) {
		const grant = CaptureGrantSchema.parse(JSON.parse(grantBytes));
		this.current(grantBytes);
		this.store.mutate((state) => {
			const entry = state.captureGrants.find((item) => item.grantBytes === grantBytes);
			if (!entry) throw new Error("capture_grant_missing");
			if (entry.phase !== "revoked") entry.phase = "revoking";
		});
		return this.request(grantBytes, "POST", `/${grant.id}/revoke`, signal);
	}

	private current(grantBytes: string) {
		const grant = CaptureGrantSchema.parse(JSON.parse(grantBytes));
		const state = this.store.read();
		if (!isDeepStrictEqual(state.block, grant.block)) throw new Error("capture_block_mismatch");
		if (!state.captureGrants.some((entry) => entry.grantBytes === grantBytes)) throw new Error("capture_grant_missing");
		return grant;
	}

	private async request(grantBytes: string, method: "GET" | "POST", suffix: string, signal: AbortSignal) {
		const grant = this.current(grantBytes);
		return this.supervisor.withHealthyEngine(async (observation) => {
			const sameInstance = isDeepStrictEqual(observation.identity, grant.identity);
			if (
				observation.identity.hostId !== grant.identity.hostId ||
				observation.identity.dataHomeId !== grant.identity.dataHomeId
			)
				throw new Error("capture_identity_mismatch");
			if (!sameInstance && method === "POST" && !suffix.endsWith("/revoke"))
				throw new Error("capture_instance_changed");
			const issuer = readCaptureIssuer(this.control.identity);
			const fetcher = this.transport.dependencies?.fetch ?? fetch;
			const client = createEngineClient({
				...this.transport,
				endpoint: observation.endpoint,
				dependencies: {
					...this.transport.dependencies,
					fetch: (url, init) => {
						const headers = new Headers(init?.headers);
						headers.set("X-Trellis-Capture-Issuer", issuer);
						return fetcher(url, { ...init, headers });
					},
				},
			});
			const response = await client.request({
				method,
				path: `/trellis-v1/capture-authorities${suffix}`,
				body: method === "POST" ? JSON.stringify({ grantBytes }) : undefined,
				signal,
			});
			if (response.state === "unknown") throw new Error("capture_receipt_unknown");
			if (response.status !== 200 && response.status !== 201) throw new Error("capture_request_refused");
			const receipt = CaptureReceiptSchema.parse(
				JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.bytes)),
			);
			if (!sameInstance && receipt.state !== "revoked") throw new Error("capture_instance_changed");
			this.accept(grantBytes, receipt);
			return receipt;
		});
	}

	private accept(grantBytes: string, receipt: CaptureReceipt) {
		const digest = protocolDigest(JSON.stringify({ grantBytes: receipt.grantBytes, state: receipt.state }));
		if (receipt.grantBytes !== grantBytes || receipt.receiptId !== digest) throw new Error("capture_receipt_mismatch");
		this.store.mutate((state) => {
			const entry = state.captureGrants.find((item) => item.grantBytes === grantBytes);
			if (!entry) throw new Error("capture_grant_missing");
			if (!isDeepStrictEqual(state.block, this.grant(entry).block)) throw new Error("capture_block_mismatch");
			if (receipt.state === "active" && (entry.phase === "revoking" || entry.phase === "revoked"))
				throw new Error("capture_grant_revoked");
			entry.receipt = receipt;
			entry.phase = receipt.state;
		});
	}

	private grant(record: CaptureRecord): CaptureGrant {
		return CaptureGrantSchema.parse(JSON.parse(record.grantBytes));
	}
}
