import { expect, test } from "bun:test";
import type { RuntimeCaptureBinding, RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import { validateCaptureBinding } from "../../../../apps/server/src/services/langflowBackup/validateCaptureBinding";

function fixture() {
	const request: RuntimeCaptureRequest = {
		captureId: "capture", snapshotId: "snapshot", hostId: "host", dataHomeId: "home", blockId: "block", generation: 7,
		identities: [{ harness: "codex", accountId: "original-account", profileId: "original-profile", agentRunId: "run", attemptId: "attempt", providerSessionId: "session" }],
	};
	const expected = [{ workspaceId: "/synthetic/workspace", attemptId: "attempt" }];
	const binding: RuntimeCaptureBinding = {
		...request,
		workspaces: [{ workspaceId: expected[0]!.workspaceId, attemptIds: ["attempt"], worktreeRootId: "tree", gitRootId: "git", commonRootId: "git" }],
		roots: [
			{ rootId: "tree", originalIdentity: expected[0]!.workspaceId, kind: "worktree", sourceKind: "workspace" },
			{ rootId: "git", originalIdentity: "/synthetic/workspace/.git", kind: "git", sourceKind: "git-directory", objectFormat: "sha1" },
		],
	};
	return { request, expected, binding };
}

test("retains the full original identity and shared Git root association", () => {
	const f = fixture();
	expect(validateCaptureBinding(f.binding, f.request, f.expected)).toEqual(f.binding);
});

test("rejects another block, generation, or account before export", () => {
	const f = fixture();
	for (const changed of [
		{ ...f.binding, blockId: "another-block" },
		{ ...f.binding, generation: 8 },
		{ ...f.binding, identities: [{ ...f.request.identities[0]!, accountId: "current-account" }] },
	]) expect(() => validateCaptureBinding(changed, f.request, f.expected)).toThrow("paired_runtime_capture_identity_mismatch");
});

test("rejects omitted, substituted, and duplicate workspace ownership", () => {
	const f = fixture();
	for (const workspaces of [[], [{ ...f.binding.workspaces[0]!, attemptIds: ["replacement-attempt"] }]])
		expect(() => validateCaptureBinding({ ...f.binding, workspaces }, f.request, f.expected)).toThrow("paired_runtime_capture_workspace_mismatch");
	expect(() => validateCaptureBinding({ ...f.binding, workspaces: [...f.binding.workspaces, ...f.binding.workspaces] }, f.request, f.expected)).toThrow("paired_runtime_capture_workspace_duplicate");
});
