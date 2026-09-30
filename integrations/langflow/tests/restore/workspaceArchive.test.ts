import { afterEach, expect, test } from "bun:test";
import { lstat, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { exportWorkspaceArchive, restoreWorkspaceArchive } from "../../../../apps/server/src/services/langflowBackup/workspaceArchive";
import { git, workspaceFixture } from "./workspaceFixture";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
	return workspaceFixture((root) => { roots.push(root); });
}

test("restores staged, dirty, untracked and executable files after source repositories are removed", async () => {
	const f = await fixture();
	const status = await git(f.worktree, "status", "--porcelain=v1", "-z");
	const head = await git(f.worktree, "rev-parse", "HEAD");
	const captured = await exportWorkspaceArchive({ capture: f.reader }, { binding: f.binding, workspaceId: f.worktree, destination: f.archive });
	if (captured.state !== "exported") throw new Error("fixture_export_unavailable");
	const restored = await restoreWorkspaceArchive({ liveHome: f.liveHome }, {
		archive: f.archive, sourceDigest: captured.sourceDigest, destination: f.destination,
	});
	await rm(f.repository, { recursive: true });
	await rm(f.worktree, { recursive: true });
	await rm(f.archive, { recursive: true });
	expect(await git(restored.worktree, "status", "--porcelain=v1", "-z")).toBe(status);
	expect(await git(restored.worktree, "rev-parse", "HEAD")).toBe(head);
	expect(await readFile(join(restored.worktree, "tracked.txt"), "utf8")).toBe("dirty\n");
	expect((await lstat(join(restored.worktree, "untracked.sh"))).mode & 0o777).toBe(0o755);
	expect(await readlink(join(restored.worktree, "link"))).toBe("tracked.txt");
	expect(restored.binding).toEqual(f.binding);
	expect(await readFile(join(restored.archive, "capture-seal.json"), "utf8")).toBe(captured.sealSourceBytes);
	const manifest = JSON.parse(await readFile(join(restored.archive, "workspace.json"), "utf8"));
	const config = manifest.files.find((entry: { root: string; path: string }) => entry.root === "common" && entry.path === "config");
	expect(await readFile(join(restored.archive, "objects", config.object), "utf8")).toContain("https://example.test/retained.git");
});

test("an absent capture producer cannot read or publish a workspace", async () => {
	const f = await fixture();
	expect(await exportWorkspaceArchive({}, { binding: f.binding, workspaceId: f.worktree, destination: f.archive }))
		.toEqual({ state: "unavailable", reason: "consistency_unavailable" });
	await expect(lstat(f.archive)).rejects.toThrow();
});

test("workspace archives retain each missing conversation root identity", async () => {
	const f = await fixture();
	const unavailable = ["/fixture/profile/archived_sessions", null].map((originalIdentity) => ({
		identity: f.binding.identities[0]!, sourceKind: "account-profile" as const,
		originalIdentity, code: "conversation_root_missing", message: "The retained root is unavailable.",
	}));
	f.inventory.unavailable.push(...unavailable);
	const captured = await exportWorkspaceArchive({ capture: f.reader }, {
		binding: f.binding, workspaceId: f.worktree, destination: f.archive,
	});
	if (captured.state !== "exported") throw new Error("fixture_export_unavailable");
	const manifest = JSON.parse(captured.sourceBytes);
	expect(manifest.inventory.unavailable).toEqual(unavailable);
	const restored = await restoreWorkspaceArchive({ liveHome: f.liveHome }, {
		archive: f.archive, sourceDigest: captured.sourceDigest, destination: f.destination,
	});
	const retained = JSON.parse(await readFile(join(restored.archive, "workspace.json"), "utf8"));
	expect(retained.inventory.unavailable).toEqual(unavailable);
});

test("a lost synthetic scope fails without a manifest or a release call", async () => {
	const f = await fixture();
	let reads = 0;
	await expect(exportWorkspaceArchive({ capture: {
		...f.reader,
		async *read(input, signal) {
			if (++reads === 2) throw new Error("capture_scope_lost");
			yield* f.reader.read(input, signal);
		},
	} }, { binding: f.binding, workspaceId: f.worktree, destination: f.archive })).rejects.toThrow("capture_scope_lost");
	await expect(lstat(join(f.archive, "workspace.json"))).rejects.toThrow();
});

test("rejects changed identities, external links, and repository alternates", async () => {
	const f = await fixture();
	const inventory = async () => ({ ...f.inventory, binding: { ...f.binding, captureId: "other" } });
	await expect(exportWorkspaceArchive({ capture: { ...f.reader, inventory } },
		{ binding: f.binding, workspaceId: f.worktree, destination: f.archive })).rejects.toThrow("workspace_capture_identity_mismatch");
	f.inventory.entries.push({ rootId: f.rootIds.worktree, path: "escape", kind: "symlink", target: "../outside" });
	await expect(exportWorkspaceArchive({ capture: f.reader }, { binding: f.binding, workspaceId: f.worktree, destination: f.archive }))
		.rejects.toThrow("workspace_link_outside_capture");
	f.inventory.entries.pop();
	f.inventory.entries.push(
		{ rootId: f.rootIds.worktree, path: "alias", kind: "symlink", target: "." },
		{ rootId: f.rootIds.worktree, path: "chained", kind: "symlink", target: "alias/../outside" },
	);
	await expect(exportWorkspaceArchive({ capture: f.reader }, { binding: f.binding, workspaceId: f.worktree, destination: f.archive }))
		.rejects.toThrow("workspace_link_outside_capture");
	f.inventory.entries.splice(-2);
	f.inventory.entries.push({ rootId: f.rootIds.common, path: "objects/info/alternates", kind: "file", mode: 0o600, size: 0, sha256: "a".repeat(64) });
	await expect(exportWorkspaceArchive({ capture: f.reader }, { binding: f.binding, workspaceId: f.worktree, destination: f.archive }))
		.rejects.toThrow("workspace_repository_dependency_unavailable");
});

test("rejects a seal for another generation before it can authorize restore", async () => {
	const f = await fixture();
	await expect(exportWorkspaceArchive({ capture: {
		...f.reader,
		seal: (input) => f.reader.seal({ ...input, binding: { ...input.binding, generation: input.binding.generation + 1 } }),
	} }, { binding: f.binding, workspaceId: f.worktree, destination: f.archive })).rejects.toThrow("workspace_capture_seal_mismatch");
	await expect(lstat(join(f.archive, "capture-seal.json"))).rejects.toThrow();
});

test("refuses live and existing destinations and corrupt archive bytes", async () => {
	const f = await fixture();
	const captured = await exportWorkspaceArchive({ capture: f.reader }, { binding: f.binding, workspaceId: f.worktree, destination: f.archive });
	if (captured.state !== "exported") throw new Error("fixture_export_unavailable");
	const input = { archive: f.archive, sourceDigest: captured.sourceDigest, destination: f.destination };
	await expect(restoreWorkspaceArchive({ liveHome: f.liveHome }, { ...input, destination: join(f.liveHome, "copy") }))
		.rejects.toThrow("workspace_restore_destination_conflict");
	await restoreWorkspaceArchive({ liveHome: f.liveHome }, input);
	await expect(restoreWorkspaceArchive({ liveHome: f.liveHome }, input)).rejects.toThrow();
	await writeFile(join(f.archive, "objects", "0"), "changed");
	await expect(restoreWorkspaceArchive({ liveHome: f.liveHome }, { ...input, destination: join(f.directory, "corrupt") }))
		.rejects.toThrow("workspace_archive_digest_mismatch");
	await expect(lstat(join(f.directory, "corrupt"))).rejects.toThrow();
});

test("selects explicit workspace roots while retaining the complete batch binding", async () => {
	const f = await fixture();
	f.binding.roots.push({ rootId: "peer-worktree", kind: "worktree", sourceKind: "workspace", originalIdentity: `${f.worktree}-peer` });
	f.binding.workspaces.push({ workspaceId: `${f.worktree}-peer`, attemptIds: ["peer-attempt"], worktreeRootId: "peer-worktree", gitRootId: f.rootIds.git, commonRootId: f.rootIds.common });
	f.binding.identities.push({ ...f.binding.identities[0]!, agentRunId: "peer-run", attemptId: "peer-attempt" });
	f.inventory.entries.push({ rootId: "peer-worktree", path: "peer-only", kind: "file", mode: 0o600, size: 1, sha256: "a".repeat(64) });
	const captured = await exportWorkspaceArchive({ capture: f.reader }, { binding: f.binding, workspaceId: f.worktree, destination: f.archive });
	if (captured.state !== "exported") throw new Error("fixture_export_unavailable");
	const archive = JSON.parse(captured.sourceBytes);
	expect(archive.inventory.binding).toEqual(f.binding);
	expect(archive.inventory.workspaceId).toBe(f.worktree);
	expect(archive.inventory.entries.some((entry: { rootId: string }) => entry.rootId === "peer-worktree")).toBe(false);
	expect(JSON.parse(captured.sealSourceBytes).binding.workspaces).toHaveLength(2);
});
