import { isDeepStrictEqual } from "node:util";
import type { HarnessHost } from "../../../agents/harnessHost/harnessHost";
import { nativeHost } from "../../../agents/native/harnessHost";
import type { JobsLog } from "../../../jobs";
import { protocolDigest } from "../../../langflowContracts";
import type { DispatchEffects, DispatchPermit, DispatchReceiptArchive, HostControlIdentity, LangflowSupervisor } from "../../../langflowHost";
import { PrivateState } from "../../../langflowHost/privateState";
import { cancellationEngine, terminalCancellationStatuses, type EngineCancellationReceipt, type EngineCancellationStatus } from "../cancellationEngine";
import { drainPendingStops } from "../drainPendingStops";
import type { StopStateCall } from "../stopState";
import { stopStateClient } from "./components/stateClient";

export type StopConnectionOptions = {
	control: { identity: HostControlIdentity; gate: Pick<DispatchEffects, "read" | "acquire" | "recoverPermit" | "settle"> };
	supervisor: Pick<LangflowSupervisor, "withHealthyEngine">;
	archive: DispatchReceiptArchive;
	database: StopStateCall;
	signal: AbortSignal;
	now(): Date;
	log: JobsLog;
	host?: Pick<HarnessHost, "stop">;
};
export type StopConnection = {
	committed(input: { executionId: string }): Promise<void>;
	recover(): Promise<void>;
};

export async function createStopConnection(options: StopConnectionOptions): Promise<StopConnection> {
	const { control, archive } = options;
	const state = stopStateClient(options.database, control.identity.hostId);
	const privateState = await PrivateState.open(control.identity.home);
	const host = options.host ?? nativeHost(control.identity.home);

	async function native(input: { executionId: string }) {
		const needsStop = await drainPendingStops({ ...input, home: control.identity.home, state, host, now: options.now, log: options.log });
		if (needsStop) throw new Error("native_stop_unconfirmed");
	}
	async function settle(permit: DispatchPermit, acknowledgement: { receipt: EngineCancellationReceipt; engineStatus: EngineCancellationStatus }) {
		if (!terminalCancellationStatuses.some((status) => status === acknowledgement.engineStatus)) return;
		const sourceBytes = JSON.stringify(acknowledgement);
		const terminal = archive.writeTerminal({ permit, outcome: "completed", sourceBytes, sourceDigest: protocolDigest(sourceBytes) });
		await control.gate.settle(permit, terminal.id);
	}
	async function engine(input: { executionId: string }) {
		options.signal.throwIfAborted();
		const prepared = await state.prepare(input);
		if (prepared.state === "absent") return;
		if (prepared.state === "authority_required") throw new Error("cancellation_authority_required");
		const binding = { effectId: `engine-cancellation:${input.executionId}:${prepared.request.requestId}`,
			kind: "cancellation" as const, executionId: input.executionId, attemptId: null,
			jobId: prepared.request.engineJobId, requestId: prepared.request.requestId,
			payloadDigest: protocolDigest(prepared.request.cancelIntentBytes) };
		const retained = control.gate.recoverPermit(binding);
		if (prepared.state === "confirmed") {
			if (retained && !retained.terminal) await settle(retained.permit, prepared.acknowledgement);
			return;
		}
		if (retained?.terminal) throw new Error("cancellation_receipt_missing");
		const permit = retained?.permit ?? control.gate.acquire(binding);
		const delivery = await options.supervisor.withHealthyEngine(async (observation) => {
			if (observation.identity.hostId !== control.identity.hostId || observation.identity.dataHomeId !== control.identity.dataHomeId ||
				observation.identity.ownerId !== prepared.authority.ownerId) throw new Error("cancellation_engine_owner_conflict");
			const current = await state.prepare(input);
			if (current.state !== "pending" || !isDeepStrictEqual(current.authority, prepared.authority))
				throw new Error("cancellation_authority_changed");
			const authorityBytes = archive.readAuthorityBytes(current.authority);
			return cancellationEngine({ endpoint: observation.endpoint,
				authenticationFile: privateState.authenticationFile(observation.identity) })
				.cancel({ ...current.request, authorityBytes }, options.signal);
		});
		if (delivery.state !== "confirmed") throw new Error(delivery.state === "unknown"
			? "cancellation_delivery_unknown" : `cancellation_delivery_failed:${delivery.status}`);
		await state.confirm({ receipt: delivery.receipt, engineStatus: delivery.engineStatus });
		const saved = await state.read(input);
		if (!saved.acknowledgement || !isDeepStrictEqual(saved.acknowledgement.receipt, delivery.receipt))
			throw new Error("cancellation_receipt_missing");
		await settle(permit, saved.acknowledgement);
		if (!terminalCancellationStatuses.some((status) => status === saved.acknowledgement!.engineStatus))
			throw new Error("cancellation_engine_still_active");
	}
	let running: Promise<void> = Promise.resolve();
	function deliverEngine(input: { executionId: string }) {
		const next = running.then(() => engine(input));
		running = next.catch((error: unknown) => {
			options.log("langflow.cancellation.delivery_failed", { executionId: input.executionId,
				error: error instanceof Error ? error.message : "unknown" });
		});
		return next;
	}
	async function committed(input: { executionId: string }) {
		const errors: unknown[] = [];
		try { await native(input); } catch (error) { errors.push(error); }
		try { await deliverEngine(input); } catch (error) { errors.push(error); }
		if (errors.length) throw new AggregateError(errors, "Cancellation retains unresolved effects.");
	}
	async function recover() {
		const pending = new Set((await state.pending({})).map((row) => row.executionId));
		for (const entry of control.gate.read().permits)
			if (!entry.terminal && entry.permit.binding.effectId.startsWith("engine-cancellation:") && entry.permit.binding.executionId)
				pending.add(entry.permit.binding.executionId);
		const errors: unknown[] = [];
		for (const executionId of pending) {
			try { await native({ executionId }); }
			catch (error) { errors.push(error); options.log("langflow.cancellation.native_drain_failed", { executionId,
				error: error instanceof Error ? error.message : "unknown" }); }
		}
		for (const executionId of pending) {
			try { await deliverEngine({ executionId }); }
			catch (error) { errors.push(error); }
		}
		if (errors.length) throw new AggregateError(errors, "Cancellation recovery retains unresolved effects.");
	}
	return { committed, recover };
}
