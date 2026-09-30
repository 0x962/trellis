import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { RuntimeCaptureFinalization, RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import * as agentTerminal from "../../services/agentRuns/terminal";
import { recoverPairedRuntimeFinalization } from "../../services/langflowBackup";
import { services } from "../../services/registry";
import { runtimeRecoveryTransport } from "./runtimeRecoveryTransport";

const request: RuntimeCaptureRequest = {
	captureId: "capture-id",
	snapshotId: "snapshot-id",
	hostId: "host-id",
	dataHomeId: "home-id",
	generation: 2,
	blockId: "block-id",
	identities: [],
};
const input = { snapshotId: request.snapshotId };

test("recovery registers the real domain before the automatic result transaction", () => {
	const entry = services["langflowBackup.recoverRuntimeFinalization"];
	expect(entry.family).toBe("io");
	expect(entry.kind).toBe("mutation");
	if (!("prepare" in entry)) throw new Error("runtime_recovery_prepare_missing");
	expect(entry.prepare).toBe(recoverPairedRuntimeFinalization);
	expect(entry.run).toBe(agentTerminal.result);
});

for (const state of ["committed", "abandoned"] as const) {
	test(`${state} keeps the exact finalization bytes under system context`, async () => {
		const receipt: RuntimeCaptureFinalization["receipt"] = {
			schemaVersion: 1,
			kind: "trellis-runtime-capture-finalization",
			request,
			requestSha256: createHash("sha256").update(JSON.stringify(request)).digest("hex"),
			outcome: state,
			finalizedAt: "2026-09-29T00:00:00.000Z",
		};
		const finalization = { receipt, receiptBytes: `${JSON.stringify(receipt, null, 2)}\n` };
		const result = { snapshotId: request.snapshotId, captureId: request.captureId, state, finalization };
		const calls: unknown[] = [];
		const port = runtimeRecoveryTransport({
			call: async (name, context, value) => {
				calls.push({ name, context, value });
				return result;
			},
		});
		expect(calls).toHaveLength(0);
		const returned = await port.recoverPairedRuntimeFinalization(input);
		expect(returned).toBe(result);
		expect(returned.finalization?.receiptBytes).toBe(finalization.receiptBytes);
		expect(calls).toEqual([
			{
				name: "langflowBackup.recoverRuntimeFinalization",
				context: expect.objectContaining({ actor: { kind: "system", name: "trellis" }, session: null }),
				value: input,
			},
		]);
	});
}

test("an unknown result stays unknown without another call", async () => {
	const result = { snapshotId: request.snapshotId, captureId: request.captureId, state: "unknown", finalization: null };
	let calls = 0;
	const port = runtimeRecoveryTransport({
		call: async () => {
			calls++;
			return result;
		},
	});
	expect(await port.recoverPairedRuntimeFinalization(input)).toBe(result);
	expect(calls).toBe(1);
});

test("the port awaits the exact worker response", async () => {
	const response = Promise.withResolvers<unknown>();
	const port = runtimeRecoveryTransport({ call: () => response.promise });
	let complete = false;
	const pending = port.recoverPairedRuntimeFinalization(input).then((result) => {
		complete = true;
		return result;
	});
	await Promise.resolve();
	expect(complete).toBe(false);
	const result = { snapshotId: request.snapshotId, captureId: request.captureId, state: "unknown", finalization: null };
	response.resolve(result);
	expect(await pending).toBe(result);
});

test("refusals and lost responses propagate without a second call", async () => {
	for (const message of ["paired_capture_block_changed", "paired_runtime_finalization_conflict", "worker_response_lost"]) {
		const failure = new Error(message);
		let calls = 0;
		const port = runtimeRecoveryTransport({
			call: async () => {
				calls++;
				throw failure;
			},
		});
		await expect(port.recoverPairedRuntimeFinalization(input)).rejects.toBe(failure);
		expect(calls).toBe(1);
	}
});
