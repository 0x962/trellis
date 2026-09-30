import { isDeepStrictEqual } from "node:util";
import type { RuntimeCaptureBinding, RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import { WorkspaceBindingSchema } from "../workspaceArchive/contracts";

export function validateCaptureBinding(
	value: RuntimeCaptureBinding,
	request: RuntimeCaptureRequest,
	workspaces: { workspaceId: string; attemptId: string }[],
) {
	const binding = WorkspaceBindingSchema.parse(value);
	const { roots: _roots, workspaces: captured, ...saved } = binding;
	if (!isDeepStrictEqual(saved, request)) throw new Error("paired_runtime_capture_identity_mismatch");
	if (new Set(captured.map((entry) => entry.workspaceId)).size !== captured.length)
		throw new Error("paired_runtime_capture_workspace_duplicate");
	const expected = workspaces.map((entry) => JSON.stringify([entry.workspaceId, entry.attemptId])).sort();
	const actual = captured.flatMap((entry) => entry.attemptIds.map((attemptId) => JSON.stringify([entry.workspaceId, attemptId]))).sort();
	if (!isDeepStrictEqual(actual, expected)) throw new Error("paired_runtime_capture_workspace_mismatch");
	return binding;
}
