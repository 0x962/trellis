import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, realpath, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, resolve, sep } from "node:path";
import { protocolDigest } from "../../../../langflowContracts";
import { syncDirectory } from "../../syncDirectory";
import { type WorkspaceArchive, WorkspaceArchiveSchema, type WorkspaceInventory } from "../contracts";
import { validateWorkspaceInventory } from "../validateWorkspaceInventory";
import { validateWorkspaceSeal } from "../validateWorkspaceSeal";

type Entry = WorkspaceInventory["entries"][number];
const contains = (parent: string, child: string) => parent === child || child.startsWith(`${parent}${sep}`);
const key = (entry: { root: string; path: string }) => `${entry.root}/${entry.path}`;

async function copyObject(source: string, file: WorkspaceArchive["files"][number], destination?: string, mode = 0o600) {
	const input = await open(join(source, "objects", file.object), constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const stat = await input.stat();
		if (!stat.isFile() || stat.nlink !== 1) throw new Error("workspace_archive_unsafe_object");
		const output = destination === undefined ? undefined : await open(destination, "wx", 0o600);
		try {
			const hash = createHash("sha256");
			let size = 0;
			for await (const chunk of input.createReadStream({ autoClose: false })) {
				hash.update(chunk);
				size += chunk.length;
				if (output) await output.writeFile(chunk);
			}
			if (hash.digest("hex") !== file.sha256 || size !== file.size) throw new Error("workspace_archive_digest_mismatch");
			await output?.chmod(mode);
			await output?.sync();
		} finally {
			await output?.close();
		}
	} finally {
		await input.close();
	}
}

function restoredEntries(inventory: WorkspaceInventory) {
	const restored = new Map<string, Entry>();
	for (const root of ["worktree", "common", "git"] as const) {
		for (const entry of inventory.entries.filter((item) => item.root === root)) {
			if (root !== "worktree" && (
				["config", "config.worktree", "commondir", "gitdir"].includes(entry.path) ||
				["worktrees", "hooks"].some((name) => entry.path === name || entry.path.startsWith(`${name}/`))
			)) continue;
			const path = root === "worktree" ? entry.path : `.git/${entry.path}`;
			restored.set(path, entry);
		}
	}
	for (const [path] of restored) {
		const parent = posix.dirname(path);
		if (parent !== "." && parent !== ".git" && restored.get(parent)?.kind !== "directory")
			throw new Error("workspace_restored_parent_conflict");
	}
	return restored;
}

export async function restoreWorkspaceArchive(
	ctx: { liveHome: string },
	input: { archive: string; sourceDigest: string; destination: string },
) {
	const archiveRoot = await realpath(input.archive);
	if (await realpath(join(archiveRoot, "objects")) !== join(archiveRoot, "objects"))
		throw new Error("workspace_archive_unsafe_objects");
	const manifest = await open(join(archiveRoot, "workspace.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
	let sourceBytes: string;
	try {
		const stat = await manifest.stat();
		if (!stat.isFile() || stat.nlink !== 1) throw new Error("workspace_archive_unsafe_manifest");
		sourceBytes = await manifest.readFile("utf8");
	} finally {
		await manifest.close();
	}
	if (protocolDigest(sourceBytes) !== input.sourceDigest) throw new Error("workspace_archive_manifest_mismatch");
	const archive = WorkspaceArchiveSchema.parse(JSON.parse(sourceBytes));
	validateWorkspaceInventory(archive.inventory);
	const seal = await open(join(archiveRoot, "capture-seal.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
	let sealBytes: Uint8Array;
	try {
		const stat = await seal.stat();
		if (!stat.isFile() || stat.nlink !== 1) throw new Error("workspace_archive_unsafe_seal");
		sealBytes = await seal.readFile();
	} finally { await seal.close(); }
	validateWorkspaceSeal(sealBytes, archive.inventory.binding, archive.inventory.workspaceId, input.sourceDigest);
	const destination = join(await realpath(dirname(input.destination)), basename(input.destination));
	const protectedPaths = [await realpath(ctx.liveHome), archiveRoot, ...archive.inventory.binding.workspaces.map((workspace) => resolve(workspace.workspaceId)),
		...archive.inventory.binding.roots.filter((root) => root.kind !== "conversation").map((root) => resolve(root.originalIdentity))];
	for (const path of protectedPaths)
		if (contains(path, destination) || contains(destination, path)) throw new Error("workspace_restore_destination_conflict");
	const files = new Map(archive.files.map((entry) => [key(entry), entry]));
	if (files.size !== archive.files.length || new Set(archive.files.map((entry) => entry.object)).size !== files.size)
		throw new Error("workspace_archive_duplicate_file");
	const expected = archive.inventory.entries.filter((entry) => entry.kind === "file");
	if (expected.length !== files.size || expected.some((entry) =>
		files.get(key(entry))?.sha256 !== entry.sha256 || files.get(key(entry))?.size !== entry.size))
		throw new Error("workspace_archive_file_inventory_mismatch");
	for (const file of archive.files) await copyObject(archiveRoot, file);
	const entries = restoredEntries(archive.inventory);
	await mkdir(destination, { mode: 0o700 });
	await syncDirectory(dirname(destination));
	const retained = join(destination, "archive");
	await mkdir(retained, { mode: 0o700 });
	await mkdir(join(retained, "objects"), { mode: 0o700 });
	for (const file of archive.files) await copyObject(archiveRoot, file, join(retained, "objects", file.object));
	const retainedManifest = await open(join(retained, "workspace.json"), "wx", 0o600);
	try { await retainedManifest.writeFile(sourceBytes); await retainedManifest.sync(); } finally { await retainedManifest.close(); }
	const retainedSeal = await open(join(retained, "capture-seal.json"), "wx", 0o600);
	try { await retainedSeal.writeFile(sealBytes); await retainedSeal.sync(); } finally { await retainedSeal.close(); }
	await syncDirectory(join(retained, "objects"));
	await syncDirectory(retained);
	const worktree = join(destination, "worktree");
	await mkdir(worktree, { mode: 0o700 });
	if (archive.inventory.repository) await mkdir(join(worktree, ".git"), { mode: 0o700 });
	const directories = [...entries].filter(([, entry]) => entry.kind === "directory")
		.sort(([a], [b]) => a.split("/").length - b.split("/").length);
	for (const [path] of directories) await mkdir(join(worktree, path), { mode: 0o700 });
	for (const [path, entry] of entries) {
		if (entry.kind === "file") {
			await copyObject(archiveRoot, files.get(key(entry))!, join(worktree, path), entry.mode);
		}
	}
	for (const [path, entry] of entries)
		if (entry.kind === "symlink") await symlink(entry.target, join(worktree, path));
	if (archive.inventory.repository) {
		const sha256 = archive.inventory.repository.objectFormat === "sha256";
		const config = `[core]\n\trepositoryformatversion = ${sha256 ? 1 : 0}\n\tbare = false\n\tfilemode = true\n` +
			(sha256 ? "[extensions]\n\tobjectformat = sha256\n" : "");
		const file = await open(join(worktree, ".git", "config"), "wx", 0o600);
		try { await file.writeFile(config); await file.sync(); } finally { await file.close(); }
	}
	for (const [path, entry] of [...directories].reverse()) {
		const directory = await open(join(worktree, path), "r");
		try {
			if (entry.kind === "directory") await directory.chmod(entry.mode);
			await directory.sync();
		} finally { await directory.close(); }
	}
	if (archive.inventory.repository) await syncDirectory(join(worktree, ".git"));
	await syncDirectory(worktree);
	const receipt = JSON.stringify({ version: 1, binding: archive.inventory.binding, workspaceId: archive.inventory.workspaceId, sourceDigest: input.sourceDigest, worktree });
	await writeFile(join(destination, "workspace-restore.json"), receipt, { flag: "wx", mode: 0o600 });
	const saved = await open(join(destination, "workspace-restore.json"), "r");
	try { await saved.sync(); } finally { await saved.close(); }
	await syncDirectory(destination);
	return { state: "isolated" as const, worktree, archive: retained, binding: archive.inventory.binding, workspaceId: archive.inventory.workspaceId, sourceDigest: input.sourceDigest };
}
