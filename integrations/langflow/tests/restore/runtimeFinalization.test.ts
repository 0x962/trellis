import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { validateRuntimeFinalization } from "../../../../apps/server/src/services/langflowBackup/validateRuntimeFinalization";

function fixture() {
	const request = {
		captureId: "capture", snapshotId: "snapshot", hostId: "host", dataHomeId: "home",
		generation: 1, blockId: "block", identities: [],
	};
	const receipt = {
		schemaVersion: 1, kind: "trellis-runtime-capture-finalization", request,
		requestSha256: createHash("sha256").update(JSON.stringify(request)).digest("hex"),
		outcome: "committed", finalizedAt: "2026-09-30T00:00:00.000Z",
	};
	return { request, receipt, receiptBytes: JSON.stringify(receipt, null, 2) };
}

test("retains the original finalization bytes", () => {
	const { request, ...finalization } = fixture();
	expect(validateRuntimeFinalization(request, finalization).receiptBytes).toBe(finalization.receiptBytes);
});

test("a missing finalization cannot authorize recovery", () => {
	const { request } = fixture();
	expect(() => validateRuntimeFinalization(request, null)).toThrow("paired_runtime_finalization_unverified");
});

test("an abandoned outcome cannot authorize capture recovery", () => {
	const { request, receipt } = fixture();
	receipt.outcome = "abandoned";
	expect(() => validateRuntimeFinalization(request, { receipt, receiptBytes: JSON.stringify(receipt) }))
		.toThrow("paired_runtime_finalization_mismatch");
});

test("changed request, digest, or receipt bytes cannot authorize recovery", () => {
	const { request, receipt, receiptBytes } = fixture();
	expect(() => validateRuntimeFinalization({ ...request, blockId: "another-block" }, { receipt, receiptBytes }))
		.toThrow("paired_runtime_finalization_mismatch");
	const changedDigest = { ...receipt, requestSha256: "0".repeat(64) };
	expect(() => validateRuntimeFinalization(request, { receipt: changedDigest, receiptBytes: JSON.stringify(changedDigest) }))
		.toThrow("paired_runtime_finalization_mismatch");
	expect(() => validateRuntimeFinalization(request, { receipt: { ...receipt, finalizedAt: "2026-09-30T01:00:00.000Z" }, receiptBytes }))
		.toThrow("paired_runtime_finalization_mismatch");
});
