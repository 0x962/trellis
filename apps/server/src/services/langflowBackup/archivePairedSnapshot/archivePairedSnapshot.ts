import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdir, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { BackupOutput } from "@trellis/api";
import { executionEnvironment } from "../../../executionEnvironment";
import { copySnapshot } from "../copySnapshot";
import { manifestName, SnapshotManifestSchema, snapshotRoots } from "../manifest";
import { readSnapshot } from "../readSnapshot";
import { syncDirectory } from "../syncDirectory";

export async function archivePairedSnapshot(input: {
	directory: string;
	manifestDigest: string;
	path: string;
}): Promise<BackupOutput> {
	if (!isAbsolute(input.path)) throw new Error("paired_archive_path_not_absolute");
	const source = await realpath(input.directory);
	const parent = await realpath(dirname(input.path));
	const path = join(parent, basename(input.path));
	if (path === source || path.startsWith(`${source}${sep}`))
		throw new Error("paired_archive_inside_snapshot");
	const manifestFile = await open(join(source, manifestName), constants.O_RDONLY | constants.O_NOFOLLOW);
	let manifestBytes: Buffer;
	try {
		const stat = await manifestFile.stat();
		if (!stat.isFile() || stat.nlink !== 1) throw new Error("snapshot_invalid_manifest_file");
		manifestBytes = await manifestFile.readFile();
	} finally {
		await manifestFile.close();
	}
	if (createHash("sha256").update(manifestBytes).digest("hex") !== input.manifestDigest)
		throw new Error("paired_archive_manifest_mismatch");
	const manifest = SnapshotManifestSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)));
	if (!isDeepStrictEqual(await readSnapshot(source), manifest)) throw new Error("paired_archive_manifest_changed");
	const temporary = await mkdtemp(join(parent, ".trellis-paired-archive-"));
	try {
		const payload = join(temporary, "payload");
		await mkdir(payload, { mode: 0o700 });
		await copySnapshot(source, payload, manifest);
		const savedManifest = await open(join(payload, manifestName), "wx", 0o600);
		try {
			await savedManifest.writeFile(manifestBytes);
			await savedManifest.sync();
		} finally {
			await savedManifest.close();
		}
		await readSnapshot(payload);
		const partial = join(temporary, "archive.tar.gz");
		const output = await open(partial, "wx", 0o600);
		let bytes: number;
		try {
			const process = Bun.spawn(["tar", "-czf", "-", "-C", payload, manifestName, ...snapshotRoots], {
				env: { ...await executionEnvironment(), COPYFILE_DISABLE: "1" },
				stdin: "ignore", stdout: output.fd, stderr: "ignore",
			});
			const code = await process.exited;
			if (code !== 0) throw new Error(`paired_archive_tar_failed:${code}`);
			await output.sync();
			bytes = (await output.stat()).size;
		} finally {
			await output.close();
		}
		await link(partial, path);
		await syncDirectory(parent);
		return { path, bytes };
	} finally {
		await rm(temporary, { recursive: true });
		await syncDirectory(parent);
	}
}
