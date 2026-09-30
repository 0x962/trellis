import { isDeepStrictEqual } from "node:util";
import { type WorkspaceBinding, WorkspaceSealSchema } from "../contracts";

export function validateWorkspaceSeal(bytes: Uint8Array, binding: WorkspaceBinding, workspaceId: string, manifestSha256: string) {
	const sourceBytes = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
	const receipt = WorkspaceSealSchema.parse(JSON.parse(sourceBytes));
	const workspace = binding.workspaces.find((entry) => entry.workspaceId === workspaceId);
	if (!workspace || !isDeepStrictEqual(receipt.binding, binding) ||
		receipt.rootId !== workspace.worktreeRootId || receipt.manifestSha256 !== manifestSha256)
		throw new Error("workspace_capture_seal_mismatch");
	return sourceBytes;
}
