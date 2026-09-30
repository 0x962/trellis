import type { RuntimeCaptureInventory } from "@trellis/runtime-protocol";
import { RuntimeWorkspaceInventorySchema, type WorkspaceInventory } from "../contracts";

export function selectWorkspaceInventory(input: RuntimeCaptureInventory): WorkspaceInventory {
	const inventory = RuntimeWorkspaceInventorySchema.parse(input);
	const roots = inventory.binding.roots;
	if (new Set(roots.map((entry) => entry.rootId)).size !== roots.length)
		throw new Error("workspace_capture_duplicate_root");
	const worktrees = roots.filter((entry) => entry.kind === "worktree");
	const git = roots.filter((entry) => entry.kind === "git");
	const common = roots.filter((entry) => entry.kind === "common");
	if (worktrees.length !== 1 || git.length > 1 || common.length !== git.length)
		throw new Error("workspace_capture_root_mismatch");
	const gitRoot = git[0];
	const commonRoot = common[0];
	if (gitRoot && commonRoot && gitRoot.objectFormat !== commonRoot.objectFormat)
		throw new Error("workspace_capture_object_format_mismatch");
	const entries: WorkspaceInventory["entries"] = [];
	for (const entry of inventory.entries) {
		const root = roots.find((candidate) => candidate.rootId === entry.rootId);
		if (!root) throw new Error("workspace_capture_root_missing");
		if (root.kind !== "conversation") entries.push({ ...entry, root: root.kind });
	}
	return {
		binding: inventory.binding,
		repository: gitRoot && commonRoot ? {
			gitDirectory: gitRoot.originalIdentity, commonDirectory: commonRoot.originalIdentity, objectFormat: gitRoot.objectFormat,
		} : null,
		entries,
		unavailable: inventory.unavailable,
	};
}
