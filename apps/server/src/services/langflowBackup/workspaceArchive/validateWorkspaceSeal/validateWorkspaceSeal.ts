import { isDeepStrictEqual } from "node:util";
import { type WorkspaceBinding, WorkspaceSealSchema } from "../contracts";

export function validateWorkspaceSeal(bytes: Uint8Array, binding: WorkspaceBinding, manifestSha256: string) {
	const sourceBytes = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
	const receipt = WorkspaceSealSchema.parse(JSON.parse(sourceBytes));
	const roots = binding.roots.filter((root) => root.kind === "worktree");
	if (roots.length !== 1 || !isDeepStrictEqual(receipt.binding, binding) ||
		receipt.rootId !== roots[0]!.rootId || receipt.manifestSha256 !== manifestSha256)
		throw new Error("workspace_capture_seal_mismatch");
	return sourceBytes;
}
