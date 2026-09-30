import type { RuntimeCaptureInventory } from "@trellis/runtime-protocol";
import { RuntimeWorkspaceInventorySchema, type WorkspaceInventory } from "../contracts";

export function selectWorkspaceInventory(input: RuntimeCaptureInventory, workspaceId: string): WorkspaceInventory {
	const inventory = RuntimeWorkspaceInventorySchema.parse(input);
	const { roots, workspaces } = inventory.binding;
	if (new Set(roots.map((entry) => entry.rootId)).size !== roots.length ||
		new Set(workspaces.map((entry) => entry.workspaceId)).size !== workspaces.length)
		throw new Error("workspace_capture_duplicate_root");
	const workspace = workspaces.find((entry) => entry.workspaceId === workspaceId);
	if (!workspace) throw new Error("workspace_capture_identity_mismatch");
	const worktree = roots.find((entry) => entry.rootId === workspace.worktreeRootId);
	const gitRoot = roots.find((entry) => entry.rootId === workspace.gitRootId);
	const commonRoot = roots.find((entry) => entry.rootId === workspace.commonRootId);
	if (worktree?.kind !== "worktree" ||
		(workspace.gitRootId === null) !== (workspace.commonRootId === null) ||
		(workspace.gitRootId !== null && (!gitRoot || !commonRoot ||
			!(gitRoot.kind === "git" || gitRoot.kind === "common") ||
			!(commonRoot.kind === "git" || commonRoot.kind === "common"))))
		throw new Error("workspace_capture_root_mismatch");
	const git = gitRoot?.kind === "git" || gitRoot?.kind === "common" ? gitRoot : null;
	const common = commonRoot?.kind === "git" || commonRoot?.kind === "common" ? commonRoot : null;
	if (git && common && git.objectFormat !== common.objectFormat)
		throw new Error("workspace_capture_object_format_mismatch");
	const entries: WorkspaceInventory["entries"] = [];
	for (const entry of inventory.entries) {
		if (!roots.some((candidate) => candidate.rootId === entry.rootId)) throw new Error("workspace_capture_root_missing");
		for (const [role, rootId] of [
			["worktree", workspace.worktreeRootId], ["git", workspace.gitRootId], ["common", workspace.commonRootId],
		] as const) if (rootId === entry.rootId) entries.push({ ...entry, root: role });
	}
	return {
		binding: inventory.binding, workspaceId,
		repository: git && common ? {
			gitDirectory: git.originalIdentity, commonDirectory: common.originalIdentity, objectFormat: git.objectFormat,
		} : null,
		entries, unavailable: inventory.unavailable,
	};
}
