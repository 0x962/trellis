import { createHash } from "node:crypto";
import { mkdir, open, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../../../langflowContracts";
import { syncDirectory } from "../../syncDirectory";
import {
	type WorkspaceArchive,
	WorkspaceBindingSchema,
	type WorkspaceBinding,
	type WorkspaceCaptureReader,
} from "../contracts";
import { selectWorkspaceInventory } from "../selectWorkspaceInventory";
import { validateWorkspaceInventory } from "../validateWorkspaceInventory";
import { validateWorkspaceSeal } from "../validateWorkspaceSeal";

export async function exportWorkspaceArchive(
	ctx: { capture?: WorkspaceCaptureReader },
	input: { binding: WorkspaceBinding; workspaceId: string; destination: string; signal?: AbortSignal },
) {
	if (!ctx.capture) return { state: "unavailable" as const, reason: "consistency_unavailable" as const };
	const binding = WorkspaceBindingSchema.parse(input.binding);
	if (!isDeepStrictEqual(ctx.capture.binding, binding)) throw new Error("workspace_capture_identity_mismatch");
	const inventory = selectWorkspaceInventory(await ctx.capture.inventory(binding, input.signal), input.workspaceId);
	if (!isDeepStrictEqual(inventory.binding, binding)) throw new Error("workspace_capture_identity_mismatch");
	validateWorkspaceInventory(inventory);
	const destination = join(await realpath(dirname(input.destination)), basename(input.destination));
	const sources = [...binding.workspaces.map((workspace) => workspace.workspaceId),
		...binding.roots.filter((root) => root.kind !== "conversation").map((root) => root.originalIdentity)];
	for (const source of sources) {
		const path = resolve(source);
		if (path === destination || destination.startsWith(`${path}${sep}`) || path.startsWith(`${destination}${sep}`))
			throw new Error("workspace_export_destination_conflict");
	}
	await mkdir(destination, { mode: 0o700 });
	await syncDirectory(dirname(destination));
	await mkdir(join(destination, "objects"), { mode: 0o700 });
	const files: WorkspaceArchive["files"] = [];
	for (const entry of inventory.entries) {
		if (entry.kind !== "file") continue;
		const object = String(files.length);
		const output = await open(join(destination, "objects", object), "wx", 0o600);
		const hash = createHash("sha256");
		let size = 0;
		try {
			for await (const chunk of ctx.capture.read({ binding, rootId: entry.rootId, path: entry.path }, input.signal)) {
				hash.update(chunk);
				size += chunk.byteLength;
				await output.writeFile(chunk);
			}
			await output.sync();
		} finally {
			await output.close();
		}
		const sha256 = hash.digest("hex");
		if (size !== entry.size || sha256 !== entry.sha256) throw new Error("workspace_capture_content_mismatch");
		files.push({ root: entry.root, path: entry.path, object, sha256, size });
	}
	const after = selectWorkspaceInventory(await ctx.capture.inventory(binding, input.signal), input.workspaceId);
	if (!isDeepStrictEqual(after, inventory)) throw new Error("workspace_capture_inventory_changed");
	const archive: WorkspaceArchive = { version: 1, inventory, files };
	const sourceBytes = JSON.stringify(archive);
	await syncDirectory(join(destination, "objects"));
	const manifest = await open(join(destination, "workspace.json"), "wx", 0o600);
	try {
		await manifest.writeFile(sourceBytes);
		await manifest.sync();
	} finally {
		await manifest.close();
	}
	await syncDirectory(destination);
	const sourceDigest = protocolDigest(sourceBytes);
	const rootId = binding.workspaces.find((workspace) => workspace.workspaceId === input.workspaceId)!.worktreeRootId;
	const sealBytes = await ctx.capture.seal({ binding, rootId, manifestSha256: sourceDigest }, input.signal);
	const sealSourceBytes = validateWorkspaceSeal(sealBytes, binding, input.workspaceId, sourceDigest);
	const seal = await open(join(destination, "capture-seal.json"), "wx", 0o600);
	try {
		await seal.writeFile(sealBytes);
		await seal.sync();
	} finally { await seal.close(); }
	await syncDirectory(destination);
	return { state: "exported" as const, binding, workspaceId: input.workspaceId, sourceBytes, sourceDigest, sealSourceBytes };
}
