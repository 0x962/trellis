import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createMaintenance } from "./db/maintenance.ts";
import { openDatabase } from "./db/open.ts";
import { executionEnvironment } from "./executionEnvironment";
import { type HomeLock, HomeLockedError, LOCK_FILE, lockHome } from "./homeLock.ts";
import { pageObjects } from "./services/pages/objects.ts";
import { readBackupManifest, verifyBackupLayout, verifyPageObjects } from "./storage/backups.ts";

// `trellis restore` runs this script: `bun restore.ts <home> <archive>`. The
// script exits 4 when another process holds the data home lock, and 1 on any
// other failure, with one line on stderr.

const stampOf = (date: Date) => date.toISOString().replace(/[:.]/g, "-");

// Entries outside the archive, such as `backups/` and the logs, move into the staged home, so
// the removal of the old home does not delete it. Each home keeps its own
// lock file, because each lock is held on that file.
const carryOver = (home: string, staged: string) => {
	const extracted = new Set(readdirSync(staged));
	for (const name of readdirSync(home)) {
		if (name === LOCK_FILE || extracted.has(name)) continue;
		renameSync(join(home, name), join(staged, name));
	}
};

// Restores a backup archive into `home` under the data home lock, so a server
// never opens the database while the directories move. The archive extracts
// beside the home. Its database is vacuumed there, because PGlite runs no
// autovacuum. Then the files outside the archive move into the new home, the
// old home moves aside, the new one takes its name, and the old one is
// removed.
export const restoreHome = async (home: string, archive: string, now = new Date()) => {
	const lock = lockHome(home, "restore", null);
	const suffix = `${stampOf(now)}-${crypto.randomUUID()}`;
	const staged = `${home}.restore-${suffix}`;
	const previous = `${home}.previous-${suffix}`;
	let stagedLock: HomeLock | undefined;
	let moving = false;
	let created = false;
	try {
		mkdirSync(staged);
		created = true;
		const tar = Bun.spawn(["tar", "-xzf", archive, "-C", staged], {
			env: await executionEnvironment(),
			stdin: "ignore",
			stdout: "ignore",
			stderr: "pipe",
		});
		const [code, stderr] = await Promise.all([tar.exited, new Response(tar.stderr).text()]);
		if (code !== 0) throw new Error(`tar did not extract the archive (exit code ${code}): ${stderr.trim()}`);
		verifyBackupLayout(staged);
		await readBackupManifest(staged);
		stagedLock = lockHome(staged, "restore", null);
		const database = await openDatabase(join(staged, "db"));
		try {
			await verifyPageObjects(staged, await database.db.transaction(pageObjects));
			await createMaintenance(database.db).runNow();
		} finally {
			await database.close();
		}
		moving = true;
		carryOver(home, staged);
		renameSync(home, previous);
		renameSync(staged, home);
		rmSync(previous, { recursive: true });
	} finally {
		stagedLock?.release();
		lock.release();
		// A failed move leaves both directories for recovery. Validation failures leave the active home intact.
		if (created && !moving) rmSync(staged, { recursive: true, force: true });
	}
};

if (import.meta.main) {
	const [home, archive] = process.argv.slice(2);
	await restoreHome(home!, archive!).catch((error: unknown) => {
		process.stderr.write(`${(error as Error).message}\n`);
		process.exit(error instanceof HomeLockedError ? 4 : 1);
	});
}
