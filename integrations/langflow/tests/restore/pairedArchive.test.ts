import { expect, test } from "bun:test";
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { protocolDigest } from "../../../../apps/server/src/langflowContracts";
import { archivePairedSnapshot, readSnapshot, sealSnapshot } from "../../../../apps/server/src/services/langflowBackup";
import { manifestName } from "../../../../apps/server/src/services/langflowBackup/manifest";
import { fixture } from "./fixture";

test("paired archive retains exact manifest bytes and all sealed components", async () => {
	const f = await fixture();
	try {
		await writeFile(join(f.snapshot, "engine", "checkpoint"), "synthetic engine checkpoint");
		await chmod(join(f.snapshot, "workspaces", "agent.patch"), 0o700);
		const manifest = await sealSnapshot({ directory: f.snapshot, metadata: f.metadata });
		const sourceBytes = `${JSON.stringify(manifest, null, 2)}\n`;
		await writeFile(join(f.snapshot, manifestName), sourceBytes);
		const result = await archivePairedSnapshot({
			directory: f.snapshot, manifestDigest: protocolDigest(sourceBytes), path: join(f.root, "paired.tar.gz"),
		});
		expect(result.bytes).toBe((await stat(result.path)).size);
		expect((await stat(result.path)).mode & 0o777).toBe(0o600);
		const extracted = join(f.root, "extracted");
		await mkdir(extracted, { mode: 0o700 });
		const process = Bun.spawn(["tar", "-xzf", result.path, "-C", extracted], { stdout: "ignore", stderr: "ignore" });
		expect(await process.exited).toBe(0);
		expect(await readFile(join(extracted, manifestName), "utf8")).toBe(sourceBytes);
		expect(await readSnapshot(extracted)).toEqual(manifest);
		expect(await readFile(join(f.snapshot, manifestName), "utf8")).toBe(sourceBytes);
		expect((await readdir(f.root)).some((name) => name.startsWith(".trellis-paired-archive-"))).toBe(false);
	} finally {
		await rm(f.root, { recursive: true });
	}
});

test("archive refuses a wrong seal or changed payload without publishing output", async () => {
	const f = await fixture();
	try {
		await sealSnapshot({ directory: f.snapshot, metadata: f.metadata });
		const bytes = await readFile(join(f.snapshot, manifestName), "utf8");
		const path = join(f.root, "paired.tar.gz");
		await expect(archivePairedSnapshot({ directory: f.snapshot, manifestDigest: "0".repeat(64), path }))
			.rejects.toThrow("paired_archive_manifest_mismatch");
		await writeFile(join(f.snapshot, "secrets", "encryption.key"), "changed synthetic bytes");
		await expect(archivePairedSnapshot({ directory: f.snapshot, manifestDigest: protocolDigest(bytes), path }))
			.rejects.toThrow("snapshot_inventory_mismatch");
		expect(await Bun.file(path).exists()).toBe(false);
		expect(await readFile(join(f.snapshot, manifestName), "utf8")).toBe(bytes);
	} finally {
		await rm(f.root, { recursive: true });
	}
});

test("archive preserves an existing destination and rejects an output inside the envelope", async () => {
	const f = await fixture();
	try {
		await sealSnapshot({ directory: f.snapshot, metadata: f.metadata });
		const manifestDigest = protocolDigest(await readFile(join(f.snapshot, manifestName), "utf8"));
		const path = join(f.root, "existing.tar.gz");
		await writeFile(path, "retained destination");
		await expect(archivePairedSnapshot({ directory: f.snapshot, manifestDigest, path })).rejects.toThrow("EEXIST");
		expect(await readFile(path, "utf8")).toBe("retained destination");
		await expect(archivePairedSnapshot({ directory: f.snapshot, manifestDigest, path: join(f.snapshot, "archive.tar.gz") }))
			.rejects.toThrow("paired_archive_inside_snapshot");
		expect((await readdir(f.root)).some((name) => name.startsWith(".trellis-paired-archive-"))).toBe(false);
	} finally {
		await rm(f.root, { recursive: true });
	}
});
