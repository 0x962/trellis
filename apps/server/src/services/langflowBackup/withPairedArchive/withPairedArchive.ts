import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, mkdtemp, open, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { isDeepStrictEqual } from "node:util";
import { createGunzip } from "node:zlib";
import { LangflowHostControl } from "../../../langflowHost";
import { extractPairedTar } from "./components/extractPairedTar";
import { manifestName, type SnapshotManifest } from "../manifest";
import { readSnapshot } from "../readSnapshot";

export type PairedArchiveSnapshot = {
	directory: string;
	manifest: SnapshotManifest;
	manifestBytes: string;
	manifestDigest: string;
};

export async function withPairedArchive<T>(
	ctx: { liveHome: string },
	input: { archive: string; signal: AbortSignal },
	consume: (snapshot: PairedArchiveSnapshot) => Promise<T>,
): Promise<T> {
	input.signal.throwIfAborted();
	if (!isAbsolute(input.archive)) throw new Error("paired_archive_path_not_absolute");
	const liveHome = await realpath(ctx.liveHome);
	const temporaryParent = await realpath(tmpdir());
	for (const protectedRoot of [liveHome, LangflowHostControl.directory(liveHome)]) {
		if (temporaryParent === protectedRoot || temporaryParent.startsWith(`${protectedRoot}${sep}`))
			throw new Error("paired_archive_staging_inside_live_home");
	}
	const archive = join(await realpath(dirname(input.archive)), basename(input.archive));
	const file = await open(archive, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const stat = await file.stat();
		if (!stat.isFile() || stat.nlink !== 1) throw new Error("paired_archive_invalid_source");
		const directory = await mkdtemp(join(temporaryParent, "trellis-paired-read-"));
		try {
			await chmod(directory, 0o700);
			await pipeline(
				file.createReadStream({ autoClose: false }),
				createGunzip(),
				async (source) => extractPairedTar(source, directory, input.signal),
				{ signal: input.signal },
			);
			input.signal.throwIfAborted();
			const manifest = await readSnapshot(directory, input.signal);
			const bytes = await readFile(join(directory, manifestName), { signal: input.signal });
			const manifestBytes = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
			if (!isDeepStrictEqual(JSON.parse(manifestBytes), manifest)) throw new Error("paired_archive_manifest_changed");
			input.signal.throwIfAborted();
			const result = await consume({ directory, manifest, manifestBytes, manifestDigest: createHash("sha256").update(bytes).digest("hex") });
			input.signal.throwIfAborted();
			return result;
		} finally {
			await rm(directory, { recursive: true });
		}
	} finally {
		await file.close();
	}
}
