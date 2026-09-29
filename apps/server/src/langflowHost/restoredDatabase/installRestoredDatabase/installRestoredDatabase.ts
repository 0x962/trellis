import { constants } from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { lockHome } from "../../../homeLock";
import { protocolDigest } from "../../../langflowContracts";
import { manifestName } from "../../../services/langflowBackup/manifest";
import { readSnapshot } from "../../../services/langflowBackup/readSnapshot";
import { syncDirectory } from "../../../services/langflowBackup/syncDirectory";
import { closed, context } from "../components/context";
import { databaseInventory } from "../components/inventory";
import { InstalledDatabaseSchema } from "../components/schema";

export async function installRestoredDatabase(input: { home: string; signal: AbortSignal }) {
	const ctx = context(input.home);
	const homeLock = lockHome(ctx.identity.home, "restore", null);
	try {
		const lock = lockHome(ctx.directory, "restore", null);
		try {
			const block = closed(ctx);
			if (block.reason.kind !== "restore") throw new Error("restored_database_block_changed");
			const payload = join(block.reason.directory, "payload");
			const manifest = await readSnapshot(payload);
			const manifestBytes = await readFile(join(payload, manifestName), "utf8");
			const manifestDigest = protocolDigest(manifestBytes);
			if (!isDeepStrictEqual(manifest, JSON.parse(manifestBytes))) throw new Error("restored_database_manifest_changed");
			if (
				manifestDigest !== block.reason.manifestDigest ||
				manifest.snapshotId !== block.reason.snapshotId ||
				manifest.sourceDataHomeId !== block.reason.sourceDataHomeId
			) {
				throw new Error("restored_database_manifest_conflict");
			}
			const prefix = "trellis/db/";
			const inventory = {
				directories: manifest.directories
					.filter((path) => path.startsWith(prefix))
					.map((path) => path.slice(prefix.length)),
				files: manifest.files
					.filter((file) => file.path.startsWith(prefix))
					.map((file) => ({ ...file, path: file.path.slice(prefix.length) })),
			};
			if (!inventory.files.some((file) => file.path === "PG_VERSION")) throw new Error("restored_database_cluster_missing");
			const dataDir = join(ctx.identity.home, "db");
			input.signal.throwIfAborted();
			await mkdir(dataDir, { mode: 0o700 });
			for (const relative of inventory.directories) await mkdir(join(dataDir, relative), { mode: 0o700 });
			for (const file of inventory.files) {
				input.signal.throwIfAborted();
				const source = await open(
					join(payload, prefix, file.path),
					constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
				);
				try {
					const stat = await source.stat();
					if (!stat.isFile() || stat.nlink !== 1) throw new Error("restored_database_file_unsafe");
					const target = await open(join(dataDir, file.path), "wx", file.executable ? 0o700 : 0o600);
					try {
						for await (const bytes of source.createReadStream({ autoClose: false })) await target.writeFile(bytes);
						await target.sync();
					} finally {
						await target.close();
					}
				} finally {
					await source.close();
				}
			}
			if (!isDeepStrictEqual(await databaseInventory(dataDir), inventory)) throw new Error("restored_database_copy_conflict");
			for (const relative of [...inventory.directories].reverse()) await syncDirectory(join(dataDir, relative));
			await syncDirectory(dataDir);
			await syncDirectory(ctx.identity.home);
			closed(ctx, block);
			const record = InstalledDatabaseSchema.parse({
				version: 1,
				identity: ctx.identity,
				block,
				dataDir,
				snapshotId: manifest.snapshotId,
				manifestDigest,
				sourceDataHomeId: manifest.sourceDataHomeId,
				inventory,
				inventoryDigest: protocolDigest(JSON.stringify(inventory)),
			});
			const sourceBytes = JSON.stringify(record);
			const receiptId = ctx.objects.write(sourceBytes);
			ctx.objects.bind("installation", receiptId);
			return { receiptId, sourceBytes, sourceDigest: protocolDigest(sourceBytes), record };
		} finally {
			lock.release();
		}
	} finally {
		homeLock.release();
	}
}
