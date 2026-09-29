import { posix } from "node:path";
import type { WorkspaceInventory } from "../contracts";

export function validateWorkspaceInventory(inventory: WorkspaceInventory) {
	const entries = new Map<string, WorkspaceInventory["entries"][number]>();
	for (const entry of inventory.entries) {
		const key = `${entry.root}/${entry.path}`;
		if (entries.has(key)) throw new Error("workspace_duplicate_entry");
		entries.set(key, entry);
		if (entry.root === "worktree" && entry.path.split("/").includes(".git"))
			throw new Error("workspace_embedded_repository_unavailable");
		if (entry.root !== "worktree") {
			if (!inventory.repository) throw new Error("workspace_repository_identity_missing");
			if (entry.path === "objects/info/alternates" || entry.path === "objects/info/http-alternates" ||
				entry.path.endsWith(".promisor") || entry.path === "modules" || entry.path.startsWith("modules/"))
				throw new Error("workspace_repository_dependency_unavailable");
		}
		if (entry.kind === "symlink") {
			const target = posix.normalize(posix.join(posix.dirname(entry.path), entry.target));
			if (entry.root !== "worktree" || entry.target.includes("\0") || entry.target.includes("\\") ||
				posix.isAbsolute(entry.target) || target === ".." || target.startsWith("../") ||
				target.split("/").includes(".git")) throw new Error("workspace_link_outside_capture");
		}
	}
	for (const entry of inventory.entries) {
		const parent = posix.dirname(entry.path);
		if (parent !== "." && entries.get(`${entry.root}/${parent}`)?.kind !== "directory")
			throw new Error("workspace_parent_not_directory");
		if (entry.kind === "symlink") {
			const parts = [...posix.dirname(entry.path).split("/"), ...entry.target.split("/")];
			const resolved: string[] = [];
			const followed = new Set<string>();
			while (parts.length) {
				const part = parts.shift()!;
				if (part === "." || part === "") continue;
				if (part === "..") {
					if (!resolved.length) throw new Error("workspace_link_outside_capture");
					resolved.pop();
					continue;
				}
				resolved.push(part);
				const path = resolved.join("/");
				const target = entries.get(`worktree/${path}`);
				if (target?.kind !== "symlink") continue;
				if (followed.has(path)) throw new Error("workspace_link_cycle");
				followed.add(path);
				resolved.pop();
				parts.unshift(...target.target.split("/"));
			}
		}
	}
	if (inventory.repository &&
		(!["git/HEAD", "common/HEAD"].some((key) => entries.get(key)?.kind === "file") ||
			entries.get("common/objects")?.kind !== "directory"))
		throw new Error("workspace_repository_incomplete");
}
