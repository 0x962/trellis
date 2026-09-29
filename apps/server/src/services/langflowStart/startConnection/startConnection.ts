import { isDeepStrictEqual } from "node:util";
import type { JobsLog } from "../../../jobs";
import {
	CorrelationReceiptV1Schema,
	type CorrelationReceiptV1,
	type DeliveryAuthorityV1,
	protocolDigest,
} from "../../../langflowContracts";
import {
	type AuthorityLifecycle,
	createEngineClient,
	type DispatchEffects,
	type DispatchPermit,
	type DispatchReceiptArchive,
	type HostControlIdentity,
	type InitialAuthorityIssuer,
	type LangflowSupervisor,
} from "../../../langflowHost";
import { PrivateState } from "../../../langflowHost/privateState";
import { createAdmissionEngine } from "../admissionEngine";
import { reconcileReservation } from "../reconcileReservation";
import type { StartStateCall } from "../startState";
import type { StartExecution } from "../store";
import { stateClient } from "./components/stateClient";

export type StartConnectionOptions = {
	control: {
		identity: HostControlIdentity;
		gate: Pick<DispatchEffects, "read" | "acquire" | "recoverPermit" | "settle">;
	};
	supervisor: Pick<LangflowSupervisor, "withHealthyEngine">;
	archive: DispatchReceiptArchive;
	issuer: InitialAuthorityIssuer;
	authorityLifecycle: Pick<AuthorityLifecycle, "committed" | "recoverInitial">;
	database: StartStateCall;
	authorityDurationMs: number;
	permissions: DeliveryAuthorityV1["permissions"];
	signal: AbortSignal;
	now(): Date;
	log: JobsLog;
};
export type StartConnection = {
	committed(input: { executionId: string }): Promise<void>;
	recover(): Promise<void>;
};

export async function createStartConnection(options: StartConnectionOptions): Promise<StartConnection> {
	const { control, supervisor, archive, issuer, authorityLifecycle, signal } = options;
	const state = stateClient(options.database, control.identity.hostId);
	const privateState = await PrivateState.open(control.identity.home);
	const engine = createAdmissionEngine({
		signal,
		admissionBytes: state.admissionBytes,
		request: (request, authority) => supervisor.withHealthyEngine(async (observation) => {
			if (observation.identity.hostId !== control.identity.hostId ||
				observation.identity.dataHomeId !== control.identity.dataHomeId)
				throw new Error("start_engine_home_conflict");
			if (authority && authority.ownerId !== observation.identity.ownerId)
				throw new Error("start_engine_owner_changed");
			return createEngineClient({
				endpoint: observation.endpoint,
				authenticationFile: privateState.authenticationFile(observation.identity),
			}).request(request);
		}),
	});

	async function permitFor(execution: StartExecution) {
		const binding = {
			effectId: `start-admission:${execution.executionId}`,
			kind: "admission" as const,
			executionId: execution.executionId,
			attemptId: null,
			jobId: null,
			requestId: execution.submission.requestId,
			payloadDigest: execution.submission.submissionDigest,
		};
		const outstanding = control.gate.read().permits.find((entry) =>
			!entry.terminal && entry.permit.binding.executionId === execution.executionId &&
			(entry.permit.binding.effectId === binding.effectId || entry.permit.binding.effectId.startsWith(`${binding.effectId}:`)));
		if (outstanding) {
			if (outstanding.permit.binding.requestId !== binding.requestId ||
				outstanding.permit.binding.payloadDigest !== binding.payloadDigest)
				throw new Error("start_permit_binding_conflict");
			return outstanding;
		}
		const initial = control.gate.recoverPermit(binding);
		if (initial?.terminal && execution.admission.state === "open" && !execution.canceled) {
			const receipt = await state.admissionBytes(execution.executionId);
			if (receipt && !receipt.confirmed) {
				const delivery = { ...binding, effectId: `${binding.effectId}:${execution.admission.receipt.admissionId}` };
				return control.gate.recoverPermit(delivery) ?? { permit: control.gate.acquire(delivery), terminal: null };
			}
		}
		return initial ?? { permit: control.gate.acquire(binding), terminal: null };
	}

	async function settle(executionId: string, permit: DispatchPermit) {
		const saved = await state.admissionBytes(executionId);
		if (!saved?.confirmed) return false;
		const terminal = archive.writeTerminal({
			permit, outcome: "completed", sourceBytes: saved.payloadBytes, sourceDigest: protocolDigest(saved.payloadBytes),
		});
		await control.gate.settle(permit, terminal.id);
		return true;
	}

	async function authorize(execution: StartExecution, correlation: CorrelationReceiptV1, permit: DispatchPermit) {
		if (correlation.hostId !== execution.hostId || correlation.executionId !== execution.executionId ||
			correlation.publicationId !== execution.publicationId ||
			correlation.submissionDigest !== execution.submission.submissionDigest)
			throw new Error("correlation_conflict");
		const prior = issuer.readInitial(execution.executionId);
		if (prior) {
			if (!isDeepStrictEqual(prior.input.correlation, correlation) || !isDeepStrictEqual(prior.input.permit, permit))
				throw new Error("initial_authority_request_conflict");
			const sameOwner = await supervisor.withHealthyEngine(async (observation) =>
				isDeepStrictEqual(observation.identity, prior.observation.identity));
			if (sameOwner) {
				archive.writeAuthority({ authorityBytes: prior.authorityBytes, issuanceReceiptId: prior.issuanceReceiptId });
				await state.restoreInitial({ executionId: execution.executionId, initialRecordBytes: prior.sourceBytes });
			} else {
				await authorityLifecycle.recoverInitial({
					executionId: execution.executionId, canceled: execution.canceled, admission: execution.admission, signal,
				});
			}
			await authorityLifecycle.committed({ executionId: execution.executionId, signal });
			const restored = await state.repository.read({ executionId: execution.executionId });
			if (!restored.authority) throw new Error("initial_binding_missing");
			return restored.authority;
		}
		return (await issuer.issue({
			executionId: execution.executionId, hostId: execution.hostId, projectId: execution.projectId,
			publicationId: execution.publicationId, publicationDigest: execution.publication.documentHash,
			submissionDigest: execution.submission.submissionDigest, correlation,
			expiresAt: new Date(options.now().getTime() + options.authorityDurationMs).toISOString(),
			permissions: execution.canceled ? ["execution.cancel"] : options.permissions,
			permit,
		})).authority;
	}

	async function canceled(execution: StartExecution, permit: DispatchPermit) {
		if (!execution.correlation) {
			const key = { version: 1 as const, hostId: execution.hostId, executionId: execution.executionId };
			const found = await engine.lookup(key);
			if (found.state !== "found") return;
			const correlation = CorrelationReceiptV1Schema.parse(found.receipt);
			const authority = await authorize(execution, correlation, permit);
			execution = await state.bindCancellation({ executionId: execution.executionId, correlation, authority });
		}
		if ((await authorityLifecycle.committed({ executionId: execution.executionId, signal })).state === "pending") return;
		const sourceBytes = await state.cancellationProof(execution.executionId);
		if (sourceBytes === null || control.gate.read().permits.some((entry) =>
			!entry.terminal && entry.permit.binding.executionId === execution.executionId &&
			entry.permit.binding.kind === "native-dispatch")) return;
		const terminal = archive.writeTerminal({ permit, outcome: "cancelled", sourceBytes, sourceDigest: protocolDigest(sourceBytes) });
		await control.gate.settle(permit, terminal.id);
	}

	async function deliver(input: { executionId: string }) {
		signal.throwIfAborted();
		const execution = await state.repository.read(input);
		if (execution.submission.state === "failed") return;
		const entry = await permitFor(execution);
		if (entry.terminal || await settle(execution.executionId, entry.permit)) return;
		if (execution.canceled) return canceled(execution, entry.permit);
		const result = await reconcileReservation(input, {
			repository: state.repository,
			engine,
			now: options.now,
			log: options.log,
			readAuthorityBytes: async (authority) => archive.readAuthorityBytes(authority),
			authorize: ({ execution: reserved, correlation }) => authorize(reserved, correlation, entry.permit),
			prepareAdmission: async (reserved) =>
				(await authorityLifecycle.committed({ executionId: reserved.executionId, signal })).state !== "pending",
		});
		if (result.disposition === "queued") await settle(execution.executionId, entry.permit);
	}

	let running: Promise<void> = Promise.resolve();
	function committed(input: { executionId: string }): Promise<void> {
		const next = running.then(() => deliver(input));
		running = next.catch((error: unknown) => {
			options.log("langflow.start.delivery_failed", {
				executionId: input.executionId, error: error instanceof Error ? error.name : "unknown",
			});
		});
		return next;
	}
	async function recover() {
		const retained = new Set<string>();
		for (const entry of control.gate.read().permits)
			if (!entry.terminal && entry.permit.binding.effectId.startsWith("start-admission:") && entry.permit.binding.executionId)
				retained.add(entry.permit.binding.executionId);
		let afterId = "";
		for (;;) {
			signal.throwIfAborted();
			const ids = await state.pending(afterId);
			for (const executionId of ids) retained.add(executionId);
			if (ids.length === 0) break;
			afterId = ids[ids.length - 1]!;
		}
		for (const executionId of retained) {
			signal.throwIfAborted();
			await committed({ executionId }).catch(() => undefined);
		}
	}
	return { committed, recover };
}
