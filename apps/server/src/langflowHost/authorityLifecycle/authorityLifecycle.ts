import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { type AdmissionStateV1, DeliveryAuthorityV1Schema, protocolDigest } from "../../langflowContracts";
import { authorityPermitBinding } from "../authorityPermit";
import type { AuthorityPort, InitialBindingPort } from "../contracts";
import type { DispatchEffects } from "../dispatchEffects";
import { createEngineClient, type EngineClientDependencies } from "../engineClient";
import { type HostControlIdentity, LangflowHostControl } from "../hostControl";
import type { InitialAuthorityIssuer } from "../initialAuthority";
import { InitialAuthorityRecovery } from "../initialAuthorityRecovery";
import type { DispatchReceiptArchive } from "../receiptArchive";
import type { LangflowSupervisor } from "../supervisor";
import { deliverAuthority } from "./deliverAuthority";
import { deliverInitialAuthority } from "./deliverInitialAuthority";
import { readAuthorityRecoveryIssuer } from "./recoveryIssuer";
import { AuthorityIntentStore, type AuthorityLeasePolicy, AuthorityLeasePolicySchema } from "./intentStore";

export type AuthorityLifecycleInput = {
	control: { identity: HostControlIdentity; gate: DispatchEffects };
	archive: DispatchReceiptArchive;
	supervisor: Pick<LangflowSupervisor, "withHealthyEngine" | "renew" | "takeover">;
	authority: AuthorityPort;
	policy: AuthorityLeasePolicy;
	initial?: { issuer: InitialAuthorityIssuer; store: AuthorityPort & InitialBindingPort };
	list(input: { afterExecutionId: string | null }): Promise<{
		items: { executionId: string }[];
		nextAfterExecutionId: string | null;
	}>;
	engineDependencies?: Partial<EngineClientDependencies>;
};
export type AuthorityRecoveryResult = {
	executionId: string;
	state: "current" | "confirmed" | "pending";
	expiresAt: string;
};

export class AuthorityLifecycle {
	private readonly intents: AuthorityIntentStore;
	private readonly policy: AuthorityLeasePolicy;
	private readonly working = new Map<string, Promise<AuthorityRecoveryResult>>();

	constructor(private readonly input: AuthorityLifecycleInput) {
		this.policy = AuthorityLeasePolicySchema.parse(input.policy);
		this.intents = new AuthorityIntentStore(input.control.identity);
	}

	async recoverInitial(request: { executionId: string; canceled: boolean; admission: AdmissionStateV1; signal: AbortSignal }) {
		request.signal.throwIfAborted();
		const initial = this.input.initial;
		if (!initial) throw new Error("initial_recovery_not_configured");
		const original = initial.issuer.readInitial(request.executionId);
		if (!original) throw new Error("initial_recovery_unavailable");
		const plan = await this.input.supervisor.withHealthyEngine(async (observation) =>
			this.intents.prepare(original.authorityBytes, observation, this.policy, true),
		);
		const binding = authorityPermitBinding(plan.intent, original.authority.engineJobId);
		const entry = this.input.control.gate.recoverPermit(binding);
		if (entry?.terminal) throw new Error("initial_recovery_already_settled");
		const permit = entry?.permit ?? this.input.control.gate.acquire(binding);
		request.signal.throwIfAborted();
		const producer = new InitialAuthorityRecovery(this.input.supervisor, initial.issuer, initial.store, this.input.archive);
		return producer.recover({ ...plan.intent, permit, canceled: request.canceled, admission: request.admission });
	}

	committed(input: { executionId: string; signal: AbortSignal }) {
		const existing = this.working.get(input.executionId);
		if (existing) return existing;
		const work = this.one(input).finally(() => this.working.delete(input.executionId));
		this.working.set(input.executionId, work);
		return work;
	}

	async recover(input: { executionId?: string; signal: AbortSignal }) {
		if (input.executionId) return [await this.committed({ ...input, executionId: input.executionId })];
		const results: AuthorityRecoveryResult[] = [];
		const seen = new Set<string>();
		for (const entry of this.input.control.gate.read().permits) {
			if (entry.terminal || !entry.permit.binding.effectId.startsWith("authority:")) continue;
			const plan = this.intents.recover(entry.permit.binding);
			results.push(await this.committed({ executionId: plan.intent.executionId, signal: input.signal }));
			seen.add(plan.intent.executionId);
		}
		let afterExecutionId: string | null = null;
		do {
			input.signal.throwIfAborted();
			const page = await this.input.list({ afterExecutionId });
			for (const item of page.items) {
				if (seen.has(item.executionId)) continue;
				results.push(await this.committed({ executionId: item.executionId, signal: input.signal }));
				seen.add(item.executionId);
			}
			afterExecutionId = page.nextAfterExecutionId;
		} while (afterExecutionId !== null);
		return results;
	}

	private async one(request: { executionId: string; signal: AbortSignal }): Promise<AuthorityRecoveryResult> {
		request.signal.throwIfAborted();
		const { control, authority, supervisor, archive } = this.input;
		if (!isDeepStrictEqual(LangflowHostControl.readIdentity(control.identity.home), control.identity)) {
			throw new Error("authority_lifecycle_home_changed");
		}
		const pending = control.gate.read().permits.filter((entry) =>
			!entry.terminal && entry.permit.binding.executionId === request.executionId &&
			entry.permit.binding.effectId.startsWith("authority:"),
		);
		if (pending.length > 1) throw new Error("authority_lifecycle_multiple_pending");
		if (pending[0]) {
			const retained = this.intents.recover(pending[0].permit.binding);
			if (retained.initial && !(await authority.readReceipt(retained.intent))) {
				return { executionId: request.executionId, state: "pending", expiresAt: retained.intent.expiresAt };
			}
		}
		const snapshot = await authority.read(request.executionId);
		const plan = pending[0]
			? this.intents.recover(pending[0].permit.binding)
			: await supervisor.withHealthyEngine(async (observation) => {
				if (
					snapshot.authority.ownerId === observation.identity.ownerId &&
					Date.parse(snapshot.authority.expiresAt) - Date.parse(observation.observedAt) > this.policy.renewBeforeMs &&
					(!snapshot.canceled || (snapshot.authority.permissions.length === 1 && snapshot.authority.permissions[0] === "execution.cancel"))
				) return null;
				return this.intents.prepare(archive.readAuthorityBytes(snapshot.authority), observation, this.policy);
			});
		if (plan === null) return { executionId: request.executionId, state: "current", expiresAt: snapshot.authority.expiresAt };
		const prior = DeliveryAuthorityV1Schema.parse(JSON.parse(plan.priorAuthorityBytes));
		const binding = authorityPermitBinding(plan.intent, prior.engineJobId);
		const existing = control.gate.recoverPermit(binding);
		const permit = existing?.permit ?? control.gate.acquire(binding);
		if (existing?.terminal) throw new Error("authority_lifecycle_revision_already_settled");
		await supervisor.withHealthyEngine(async (observation) => {
			if (observation.identity.ownerId !== plan.targetOwnerId) throw new Error("authority_lifecycle_owner_changed");
		});
		const saved = await authority.readReceipt(plan.intent);
		if (!saved) {
			if (plan.initial) throw new Error("initial_recovery_binding_pending");
			request.signal.throwIfAborted();
			if ("expectedOwnerId" in plan.intent) await supervisor.takeover({ ...plan.intent, permit });
			else await supervisor.renew({ ...plan.intent, permit });
		}
		const commit = await authority.readReceipt(plan.intent);
		if (!commit || !isDeepStrictEqual(commit.permit, permit)) throw new Error("authority_lifecycle_commit_missing");
		const authorityBytes = archive.readAuthorityBytes(commit.receipt.authority);
		return supervisor.withHealthyEngine(async (observation) => {
			if (
				observation.identity.ownerId !== plan.targetOwnerId ||
				commit.receipt.authority.ownerId !== observation.identity.ownerId ||
				commit.receipt.authority.hostId !== observation.identity.hostId ||
				control.identity.dataHomeId !== observation.identity.dataHomeId
			) throw new Error("authority_lifecycle_owner_changed");
			request.signal.throwIfAborted();
			const client = createEngineClient({
				endpoint: observation.endpoint,
				authenticationFile: join(control.identity.home, "langflow", "secrets", `${observation.identity.instanceId}.token`),
				dependencies: this.input.engineDependencies,
			});
			let delivered = plan.initial
				? { state: "absent" as const }
				: await deliverAuthority({ client, plan, authorityBytes, signal: request.signal });
			if (delivered.state === "absent" || plan.initial) {
				const original = this.input.initial?.issuer.readInitial(request.executionId);
				if (!original || original.authorityBytes !== plan.priorAuthorityBytes) {
					throw new Error("initial_recovery_predecessor_unavailable");
				}
				const requestBytes = this.intents.recoveryRequest(commit, original.sourceBytes);
				const issuer = readAuthorityRecoveryIssuer(control.identity);
				const fetcher = this.input.engineDependencies?.fetch ?? fetch;
				const recoveryClient = createEngineClient({
					endpoint: observation.endpoint,
					authenticationFile: join(control.identity.home, "langflow", "secrets", `${observation.identity.instanceId}.token`),
					dependencies: {
						...this.input.engineDependencies,
						fetch: (url, init) => {
							const headers = new Headers(init?.headers);
							headers.set("X-Trellis-Authority-Recovery-Issuer", issuer);
							return fetcher(url, { ...init, headers });
						},
					},
				});
				delivered = await deliverInitialAuthority({ client: recoveryClient, requestBytes, signal: request.signal });
			}
			if (delivered.state !== "confirmed") {
				return { executionId: request.executionId, state: "pending", expiresAt: commit.receipt.authority.expiresAt };
			}
			const terminal = archive.writeTerminal({
				permit,
				outcome: "completed",
				sourceBytes: delivered.sourceBytes,
				sourceDigest: protocolDigest(delivered.sourceBytes),
			});
			await control.gate.settle(permit, terminal.id);
			return { executionId: request.executionId, state: "confirmed", expiresAt: commit.receipt.authority.expiresAt };
		});
	}
}
