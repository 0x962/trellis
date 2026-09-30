import { expect, test } from "bun:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { recoverPairedRuntimeFinalization } from "../../../../apps/server/src/services/langflowBackup/recoverPairedRuntimeFinalization";
import { recoverRuntimeReceipt } from "../../../../apps/server/src/services/langflowBackup/recoverPairedRuntimeFinalization/components/recoverRuntimeReceipt";
import { validateRuntimeFinalization } from "../../../../apps/server/src/services/langflowBackup/validateRuntimeFinalization";
import { runtimeRecoveryFixture } from "./runtimeRecoveryFixture";

test("recovers a lost reply and clears its residual hold with the saved outcome", async () => {
	const f = await runtimeRecoveryFixture();
	try {
		const result = await recoverRuntimeReceipt(f, f.input);
		expect(result.state).toBe("committed");
		expect(result.finalization?.receiptBytes).toBe(f.finalization.receiptBytes);
		expect(f.reads).toEqual([f.request]);
		expect(f.finalizes).toEqual([{ request: f.request, outcome: "committed" }]);
		expect(f.runtimeState.hold).toBe(false);
		expect(await f.journal.read("runtime-finalized")).toEqual(f.finalization);
		expect(f.control.gate.read().block.id).toBe(f.request.blockId);
	} finally { await f.cleanup(); }
});

test("equal recovery preserves the original receipt bytes and journal file", async () => {
	const f = await runtimeRecoveryFixture();
	try {
		await recoverRuntimeReceipt(f, f.input);
		const path = join(f.journal.directory, "runtime-finalized.json");
		const before = await readFile(path);
		const replay = await recoverRuntimeReceipt(f, f.input);
		expect(await readFile(path)).toEqual(before);
		expect(replay.finalization?.receiptBytes).toBe(f.finalization.receiptBytes);
	} finally { await f.cleanup(); }
});

test("a missing receipt stays unknown despite exported files and seal records", async () => {
	const f = await runtimeRecoveryFixture();
	try {
		f.runtimeState.finalization = null;
		await writeFile(join(f.root, "exported-database"), "synthetic bytes");
		await f.journal.write("sealed", { manifestDigest: "a".repeat(64) });
		const result = await recoverRuntimeReceipt(f, f.input);
		expect(result.state).toBe("unknown");
		expect(result.finalization).toBeNull();
		expect(f.finalizes).toEqual([]);
		expect(f.runtimeState.hold).toBe(true);
		expect(await f.journal.read("runtime-finalized")).toBeNull();
	} finally { await f.cleanup(); }
});

test("an abandoned receipt clears only its abandoned hold and cannot finish capture", async () => {
	const f = await runtimeRecoveryFixture("abandoned");
	try {
		const result = await recoverRuntimeReceipt(f, f.input);
		expect(result.state).toBe("abandoned");
		expect(f.finalizes).toEqual([{ request: f.request, outcome: "abandoned" }]);
		expect(() => validateRuntimeFinalization(f.request, result.finalization))
			.toThrow("paired_runtime_finalization_mismatch");
	} finally { await f.cleanup(); }
});

test("changed journal identities refuse recovery before any runtime request", async () => {
	for (const field of ["hostId", "dataHomeId", "snapshotId", "blockId", "generation"] as const) {
		const f = await runtimeRecoveryFixture();
		try {
			const changed = { ...f.request, [field]: field === "generation" ? 2 : "other" };
			await writeFile(join(f.journal.directory, "runtime-request.json"), JSON.stringify(changed));
			await expect(recoverRuntimeReceipt(f, f.input)).rejects.toThrow("paired_runtime_request_binding_mismatch");
			expect(f.reads).toEqual([]);
			expect(f.finalizes).toEqual([]);
		} finally { await f.cleanup(); }
	}
});

test("a changed capture identity or digest in the receipt cannot authorize finalization", async () => {
	for (const field of ["captureId", "requestSha256"] as const) {
		const f = await runtimeRecoveryFixture();
		try {
			const receipt = structuredClone(f.finalization.receipt);
			if (field === "captureId") receipt.request.captureId = "another-capture";
			else receipt.requestSha256 = "0".repeat(64);
			f.runtimeState.finalization = { receipt, receiptBytes: JSON.stringify(receipt) };
			await expect(recoverRuntimeReceipt(f, f.input)).rejects.toThrow("paired_runtime_finalization_mismatch");
			expect(f.finalizes).toEqual([]);
		} finally { await f.cleanup(); }
	}
});

test("a block change during lookup prevents residual hold finalization", async () => {
	const f = await runtimeRecoveryFixture();
	try {
		f.runtime.readCaptureFinalization = async () => {
			f.control.gate.read().block.generation += 1;
			return f.finalization;
		};
		await expect(recoverRuntimeReceipt(f, f.input)).rejects.toThrow("paired_capture_block_changed");
		expect(f.finalizes).toEqual([]);
	} finally { await f.cleanup(); }
});

test("a lost recovery reply retains the missing journal receipt until exact replay", async () => {
	const f = await runtimeRecoveryFixture();
	try {
		const finalize = f.runtime.finalizeCapture;
		f.runtime.finalizeCapture = async (input) => {
			await finalize(input);
			throw new Error("synthetic_lost_reply");
		};
		await expect(recoverRuntimeReceipt(f, f.input)).rejects.toThrow("synthetic_lost_reply");
		expect(await f.journal.read("runtime-finalized")).toBeNull();
		f.runtime.finalizeCapture = finalize;
		expect((await recoverRuntimeReceipt(f, f.input)).finalization).toEqual(f.finalization);
	} finally { await f.cleanup(); }
});

test("a conflicting recovery acknowledgement cannot replace the saved receipt", async () => {
	const f = await runtimeRecoveryFixture();
	try {
		f.runtime.finalizeCapture = async () => ({
			...f.finalization, receiptBytes: JSON.stringify(f.finalization.receipt),
		});
		await expect(recoverRuntimeReceipt(f, f.input)).rejects.toThrow("paired_runtime_finalization_conflict");
		expect(await f.journal.read("runtime-finalized")).toBeNull();
	} finally { await f.cleanup(); }
});

test("a conflicting retained journal receipt prevents a runtime mutation", async () => {
	const f = await runtimeRecoveryFixture();
	try {
		await f.journal.write("runtime-finalized", {
			...f.finalization, receiptBytes: JSON.stringify(f.finalization.receipt),
		});
		await expect(recoverRuntimeReceipt(f, f.input)).rejects.toThrow("paired_runtime_finalization_conflict");
		expect(f.finalizes).toEqual([]);
	} finally { await f.cleanup(); }
});

test("a missing original request cannot be reconstructed from a receipt", async () => {
	const f = await runtimeRecoveryFixture();
	try {
		await rm(join(f.journal.directory, "runtime-request.json"));
		await expect(recoverRuntimeReceipt(f, f.input)).rejects.toThrow("paired_runtime_request_unavailable");
		expect(f.reads).toEqual([]);
	} finally { await f.cleanup(); }
});

test("the public operation requires a system actor before it opens a native client", () => {
	expect(() => recoverPairedRuntimeFinalization({
		home: "/unused-synthetic-home", actor: { kind: "human", name: "fixture" },
	}, { snapshotId: "unused" })).toThrow("paired_capture_requires_system_actor");
});
