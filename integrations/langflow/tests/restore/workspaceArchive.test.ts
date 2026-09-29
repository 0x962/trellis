import { afterEach, expect, test } from "bun:test";
import { lstat, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { exportWorkspaceArchive, restoreWorkspaceArchive } from "../../../../apps/server/src/services/langflowBackup/workspaceArchive";
import { git, workspaceFixture } from "./workspaceFixture";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
	const result = await workspaceFixture();
	roots.push(result.directory);
	return result;
}

test("restores staged, dirty, untracked and executable files after source repositories are removed", async () => {
	const f = await fixture();
	const status = await git(f.worktree, "status", "--porcelain=v1", "-z");
	const head = await git(f.worktree, "rev-parse", "HEAD");
	const captured = await exportWorkspaceArchive({ capture: f.reader }, { binding: f.binding, destination: f.archive });
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
	const manifest = JSON.parse(await readFile(join(restored.archive, "workspace.json"), "utf8"));
	const config = manifest.files.find((entry: { root: string; path: string }) => entry.root === "common" && entry.path === "config");
	expect(await readFile(join(restored.archive, "objects", config.object), "utf8")).toContain("https://example.test/retained.git");
});

test("an absent capture producer cannot read or publish a workspace", async () => {
	const f = await fixture();
	expect(await exportWorkspaceArchive({}, { binding: f.binding, destination: f.archive }))
		.toEqual({ state: "unavailable", reason: "consistency_unavailable" });
	await expect(lstat(f.archive)).rejects.toThrow();
});

test("a lost synthetic scope fails without a manifest or a release call", async () => {
	const f = await fixture();
	let reads = 0;
	await expect(exportWorkspaceArchive({ capture: {
		list: f.reader.list,
		async *read(binding, location) {
			if (++reads === 2) throw new Error("capture_scope_lost");
			yield* f.reader.read(binding, location);
		},
	} }, { binding: f.binding, destination: f.archive })).rejects.toThrow("capture_scope_lost");
	await expect(lstat(join(f.archive, "workspace.json"))).rejects.toThrow();
});

test("rejects changed identities, external links, and repository alternates", async () => {
	const f = await fixture();
	const list = async () => ({ ...f.inventory, binding: { ...f.binding, captureId: "other" } });
	await expect(exportWorkspaceArchive({ capture: { ...f.reader, list } },
		{ binding: f.binding, destination: f.archive })).rejects.toThrow("workspace_capture_identity_mismatch");
	f.inventory.entries.push({ root: "worktree", path: "escape", kind: "symlink", target: "../outside" });
	await expect(exportWorkspaceArchive({ capture: f.reader }, { binding: f.binding, destination: f.archive }))
		.rejects.toThrow("workspace_link_outside_capture");
	f.inventory.entries.pop();
	f.inventory.entries.push({ root: "common", path: "objects/info/alternates", kind: "file", mode: 0o600 });
	await expect(exportWorkspaceArchive({ capture: f.reader }, { binding: f.binding, destination: f.archive }))
		.rejects.toThrow("workspace_repository_dependency_unavailable");
});

test("refuses live and existing destinations and corrupt archive bytes", async () => {
	const f = await fixture();
	const captured = await exportWorkspaceArchive({ capture: f.reader }, { binding: f.binding, destination: f.archive });
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
