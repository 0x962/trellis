import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { RuntimeCaptureBinding, RuntimeCaptureFrame } from "../capture.ts";
import { CaptureFrameDecoder, decodeCaptureFrame, encodeCaptureFrame } from "./captureWire.ts";

const request = {
	captureId: "capture-1",
	snapshotId: "snapshot-1",
	hostId: "host-1",
	dataHomeId: "home-1",
	generation: 4,
	blockId: "block-1",
	identities: [
		{
			harness: "codex",
			accountId: "account-1",
			profileId: "profile-1",
			agentRunId: "run-1",
			attemptId: "attempt-1",
			providerSessionId: "session-1",
		},
	],
};

const binding: RuntimeCaptureBinding = {
	...request,
	workspaces: [
		{
			workspaceId: "/home/agents/run-1/work",
			attemptIds: ["attempt-1"],
			worktreeRootId: "worktree-1",
			gitRootId: null,
			commonRootId: "common-1",
		},
	],
	roots: [
		{
			rootId: "worktree-1",
			kind: "worktree",
			sourceKind: "workspace",
			originalIdentity: "/home/agents/run-1/work",
		},
		{
			rootId: "common-1",
			kind: "common",
			sourceKind: "common-directory",
			originalIdentity: "/repo/.git",
			objectFormat: "sha256",
		},
	],
};

describe("capture wire", () => {
	test("round trips each frame kind", () => {
		const finalizationReceipt = {
			schemaVersion: 1 as const,
			kind: "trellis-runtime-capture-finalization" as const,
			request,
			requestSha256: createHash("sha256").update(JSON.stringify(request)).digest("hex"),
			outcome: "committed" as const,
			finalizedAt: "2026-09-30T00:00:00.000Z",
		};
		const frames: RuntimeCaptureFrame[] = [
			{ type: "binding", binding },
			{ type: "inventory", binding },
			{ type: "inventory-result", inventory: { binding, entries: [], unavailable: [] } },
			{ type: "read", input: { binding, rootId: "worktree-1", path: "source.ts" } },
			{ type: "data", data: new Uint8Array([0, 10, 255]) },
			{ type: "end" },
			{ type: "seal", input: { binding, rootId: "worktree-1", manifestSha256: "a".repeat(64) } },
			{ type: "receipt", receipt: new Uint8Array([1, 2, 3]) },
			{ type: "finalize", outcome: "committed" },
			{
				type: "finalized",
				finalization: {
					receipt: finalizationReceipt,
					receiptBytes: JSON.stringify(finalizationReceipt),
				},
			},
			{ type: "error", code: "CAPTURE_UNAVAILABLE", message: "A writer is active" },
		];
		for (const frame of frames) {
			const encoded = encodeCaptureFrame(frame);
			expect(decodeCaptureFrame(encoded.subarray(4))).toEqual(frame);
		}
	});

	test("decodes split and combined frames", () => {
		const decoder = new CaptureFrameDecoder();
		const bytes = Buffer.concat([
			encodeCaptureFrame({ type: "binding", binding }),
			encodeCaptureFrame({ type: "data", data: new Uint8Array([4, 5, 6]) }),
			encodeCaptureFrame({ type: "end" }),
		]);
		const frames = [
			...decoder.push(bytes.subarray(0, 2)),
			...decoder.push(bytes.subarray(2, 19)),
			...decoder.push(bytes.subarray(19)),
		];
		expect(frames).toEqual([
			{ type: "binding", binding },
			{ type: "data", data: new Uint8Array([4, 5, 6]) },
			{ type: "end" },
		]);
		expect(decoder.incomplete).toBe(false);
	});
});
