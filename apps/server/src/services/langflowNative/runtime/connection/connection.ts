import type { JobsLog } from "../../../../jobs";
import {
	type DeliveryAuthorityV1,
	NativeResultV1Schema,
	protocolDigest,
	readProtocolBytes,
} from "../../../../langflowContracts";
import type { DispatchEffects, DispatchPermit, DispatchReceiptArchive } from "../../../../langflowHost";
import { deliverNativeCompletion } from "../completionEngine";
import type { ExecutionKey, NativeEngineClient, NativeKey, NativeRuntimePort, NativeRuntimeRow } from "../contracts";

export type NativeRuntimeConnectionOptions = {
	database: NativeRuntimePort;
	gate: Pick<DispatchEffects, "acquire" | "recoverPermit" | "read" | "settle">;
	archive: Pick<DispatchReceiptArchive, "readAuthorityBytes" | "writeTerminal">;
	withEngine<T>(authority: DeliveryAuthorityV1, action: (client: NativeEngineClient) => Promise<T>): Promise<T>;
	refreshExecution(input: ExecutionKey): Promise<void>;
	signal: AbortSignal;
	log: JobsLog;
};

export function createNativeRuntimeConnection(options: NativeRuntimeConnectionOptions) {
	const { database, signal, gate, archive } = options;
	async function settle(permit: DispatchPermit) {
		if (permit.binding.executionId === null) throw new Error("native_completion_permit_conflict");
		const receipt = await database.state("receipt", {
			executionId: permit.binding.executionId,
			completionId: permit.binding.requestId,
		});
		if (receipt === null) return false;
		if (receipt.resultDigest !== permit.binding.payloadDigest || receipt.engineJobId !== permit.binding.jobId)
			throw new Error("native_completion_permit_conflict");
		const sourceBytes = JSON.stringify(receipt);
		const terminal = archive.writeTerminal({
			permit,
			outcome: "completed",
			sourceBytes,
			sourceDigest: protocolDigest(sourceBytes),
		});
		await gate.settle(permit, terminal.id);
		return true;
	}
	async function deliver(key: NativeKey) {
		signal.throwIfAborted();
		const delivery = await database.state("delivery", key);
		if (delivery === null) return;
		const result = readProtocolBytes(NativeResultV1Schema, delivery.resultBytes);
		const binding = {
			effectId: `native-completion:${result.completionId}`,
			kind: "engine-delivery" as const,
			executionId: key.executionId,
			attemptId: result.attemptId,
			jobId: result.launchBinding.engineJobId,
			requestId: result.completionId,
			payloadDigest: protocolDigest(delivery.resultBytes),
		};
		const prior = gate.recoverPermit(binding);
		const permit = prior?.permit ?? gate.acquire(binding);
		if (prior?.terminal || (await settle(permit))) return;
		const authorityBytes = await archive.readAuthorityBytes(delivery.authority);
		const completed = await options.withEngine(delivery.authority, (client) =>
			deliverNativeCompletion({
				client,
				delivery,
				authorityBytes,
				signal,
				current: () => database.state("delivery", key),
			}),
		);
		if (completed.state === "pending") {
			options.log("langflow.native.completion_pending", {
				...key,
				completionId: result.completionId,
				reason: completed.reason,
			});
			return;
		}
		await database.acknowledge({
			...key,
			requestBytes: delivery.requestBytes,
			waitBytes: completed.waitBytes,
			receipt: completed.receipt,
		});
		await settle(permit);
		await options.refreshExecution(key);
	}
	async function reconcile(row: NativeRuntimeRow) {
		signal.throwIfAborted();
		const key = { executionId: row.executionId, stepId: row.stepId };
		if (row.handle.state === "reserved" && row.admissionOpen && !row.canceled && row.authority !== null) {
			await database.recover(key);
			signal.throwIfAborted();
		}
		if (row.observe) {
			await database.observe(key);
			await options.refreshExecution(key);
		}
		await deliver(key);
	}
	async function committed(input: ExecutionKey) {
		let afterStepId = "";
		for (;;) {
			signal.throwIfAborted();
			const page = await database.state("steps", { ...input, afterStepId });
			if (page.length === 0) return;
			for (const row of page) {
				signal.throwIfAborted();
				try {
					await reconcile(row);
				} catch (error) {
					if (signal.aborted) throw error;
					options.log("langflow.native.recovery_failed", {
						executionId: row.executionId,
						stepId: row.stepId,
						error: error instanceof Error ? error.message : "unknown",
					});
				}
			}
			afterStepId = page[page.length - 1]!.stepId;
		}
	}
	async function recover() {
		for (const entry of gate.read().permits) {
			signal.throwIfAborted();
			if (
				entry.terminal ||
				entry.permit.binding.kind !== "engine-delivery" ||
				!entry.permit.binding.effectId.startsWith("native-completion:")
			)
				continue;
			await settle(entry.permit);
		}
		let afterId = "";
		for (;;) {
			signal.throwIfAborted();
			const page = await database.state("pending", { afterId });
			if (page.length === 0) return;
			for (const executionId of page) await committed({ executionId });
			afterId = page[page.length - 1]!;
		}
	}
	return { committed, recover };
}
