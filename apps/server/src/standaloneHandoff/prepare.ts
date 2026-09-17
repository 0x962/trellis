import { existsSync, lstatSync } from "node:fs";
import { mkdir, realpath, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { openDatabase } from "../db/open.ts";
import { copyEntries } from "../homeImport/copy.ts";
import { syncDirectory, writeJson } from "../homeImport/durable.ts";
import { canonicalTarget } from "../homeImport/paths.ts";
import { assertNoLiveProcesses } from "../homeImport/processes.ts";
import { readOnlyLocks } from "../homeImport/readOnlyLocks.ts";
import { scan } from "../homeImport/scan.ts";
import { assertStandaloneHandoffReady } from "./bootGuard.ts";

export const prepareStandaloneHandoff = async (input: {
	home: string;
	backupPath: string;
	restoreStandaloneService?: boolean;
}) => {
	const home = await realpath(input.home);
	const backupPath = canonicalTarget(input.backupPath);
	const backupRoot = join(home, "backups");
	if (dirname(backupPath) !== backupRoot || !/^desktop-handoff-[a-zA-Z0-9-]+$/.test(basename(backupPath)))
		throw new Error(`Choose an unused desktop-handoff directory directly under ${backupRoot}.`);
	if (existsSync(backupRoot) && lstatSync(backupRoot).isSymbolicLink())
		throw new Error(`Backup directory ${backupRoot} must not be a symlink.`);
	if (lstatSync(join(home, "db")).isSymbolicLink() || !existsSync(join(home, "db", "PG_VERSION")))
		throw new Error(`Home ${home} must contain its own db/PG_VERSION.`);
	const release = readOnlyLocks(home);
	try {
		assertStandaloneHandoffReady(home);
		assertNoLiveProcesses(home);
		await mkdir(backupRoot, { recursive: true, mode: 0o700 });
		await mkdir(backupPath, { mode: 0o700 });
		const domain = `gui/${process.getuid!()}`;
		const restoreCommands = input.restoreStandaloneService
			? [
					{ command: "launchctl", args: ["enable", `${domain}/com.trellis.server`] },
					{
						command: "launchctl",
						args: ["bootstrap", domain, join(homedir(), "Library/LaunchAgents/com.trellis.server.plist")],
					},
				]
			: [];
		const provenance = { home, backupPath, createdAt: new Date().toISOString(), restoreCommands };
		const marker = join(home, "standalone-handoff-in-progress.json");
		writeJson(marker, provenance, true);
		syncDirectory(home);
		const plan = await scan(join(home, "db"), join(backupPath, "db"));
		await mkdir(join(backupPath, "db"), { mode: 0o700 });
		await copyEntries(join(home, "db"), join(backupPath, "db"), plan.entries);
		for (const entry of [...plan.entries].reverse())
			if (entry.kind === "directory") syncDirectory(join(backupPath, "db", entry.path));
		writeJson(
			join(backupPath, "backup.json"),
			{ ...provenance, databaseVersion: plan.version, state: "complete" },
			true,
		);
		syncDirectory(join(backupPath, "db"));
		syncDirectory(backupPath);
		syncDirectory(backupRoot);
		const database = await openDatabase(join(home, "db"));
		try {
			await database.db.transaction(async (tx) => {
				await tx.execute(
					sql`UPDATE settings SET value=jsonb_set(value,'{enabled}','false'::jsonb),updated_at=now() WHERE key='agents'`,
				);
			});
		} finally {
			await database.close();
		}
		const result = { ...provenance, automationPaused: true as const };
		writeJson(join(backupPath, "handoff.json"), result, true);
		syncDirectory(backupPath);
		await rm(marker);
		syncDirectory(home);
		return result;
	} finally {
		release();
	}
};
