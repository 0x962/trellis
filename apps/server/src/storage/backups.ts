import { constants, existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { hashFile, withHashLock } from "./hashStore.ts";
import { pageObjectPath } from "./pageObjects.ts";

// A backup copies the data home to `backups/snapshot-<stamp>`, then writes
// `backups/trellis-<stamp>.tar.gz.partial` and renames it when tar exits 0.
// A finished archive never carries the `.partial` suffix, so a name with it
// is always an archive that stopped halfway.

export const SNAPSHOT_PREFIX = "snapshot-";
export const PARTIAL_SUFFIX = ".partial";

// Removes the snapshot copies and the partial archives of backups that
// stopped halfway. The boot calls it before the server accepts requests, so
// no backup of this process is running. Returns the removed names.
export const sweepBackups = (dir: string) => {
	const leftovers = readdirSync(dir).filter(
		(name) => name.startsWith(SNAPSHOT_PREFIX) || name.endsWith(PARTIAL_SUFFIX),
	);
	for (const name of leftovers) rmSync(join(dir, name), { recursive: true, force: true });
	return leftovers;
};

export const BACKUP_MANIFEST = "backup-manifest.json";
const manifestSchema = z.strictObject({ version: z.literal(1), capabilities: z.array(z.literal("pages-v1")) });

const archiveRoots = new Set(["db", "attachments", "pages", BACKUP_MANIFEST]);

export const verifyBackupLayout = (home: string) => {
	const visit = (path: string) => {
		const stat = lstatSync(path);
		if (stat.isDirectory()) {
			for (const name of readdirSync(path)) visit(join(path, name));
		} else if (!stat.isFile() || stat.nlink !== 1) {
			throw new Error("The backup contains a linked or special file.");
		}
	};
	for (const name of readdirSync(home)) {
		if (!archiveRoots.has(name)) throw new Error(`The backup contains an unsupported entry: ${name}`);
		visit(join(home, name));
	}
	if (!existsSync(join(home, "db", "PG_VERSION")) || !existsSync(join(home, "db", "global", "pg_control")))
		throw new Error("The backup does not contain a database cluster.");
};

export const readBackupManifest = async (home: string) => {
	const path = join(home, BACKUP_MANIFEST);
	if (existsSync(path)) manifestSchema.parse(await Bun.file(path).json());
};

// The caller keeps the database transaction open until the snapshot holds a copy of each object.
export const snapshotPageObjects = async (
	home: string,
	staged: string,
	objects: Array<{ sha256: string; size: number }>,
) => {
	await mkdir(join(staged, "pages", "objects"), { recursive: true });
	for (const { sha256 } of objects) {
		const source = pageObjectPath(home, sha256);
		const target = pageObjectPath(staged, sha256);
		await mkdir(dirname(target), { recursive: true });
		await withHashLock(source, () => copyFile(source, target, constants.COPYFILE_FICLONE));
	}
	await Bun.write(join(staged, BACKUP_MANIFEST), JSON.stringify({ version: 1, capabilities: ["pages-v1"] }));
};

export const verifyPageObjects = async (home: string, objects: Array<{ sha256: string; size: number }>) => {
	for (const object of objects) {
		const stored = await hashFile(Bun.file(pageObjectPath(home, object.sha256)), () => {});
		if (stored.sha256 !== object.sha256 || stored.size !== Number(object.size))
			throw new Error(`Page object verification failed: ${object.sha256}`);
	}
};
