import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDatabase } from "../db/open.ts";
import { lockHome } from "../homeLock.ts";
import { assertHomeImportReady } from "./bootGuard.ts";
import { copyEntries } from "./copy.ts";
import { syncDirectory, writeJson } from "./durable.ts";
import { resolvePaths } from "./paths.ts";
import { prepare } from "./prepare.ts";
import { assertNoLiveProcesses } from "./processes.ts";
import { readOnlyLocks } from "./readOnlyLocks.ts";
import { scan } from "./scan.ts";
import type { HomeImportPaths, HomeImportResult, ImportInventory } from "./types.ts";
export const importHome = async (
	input: HomeImportPaths & { expectedVersion: string },
	now = new Date(),
): Promise<HomeImportResult> => {
	const paths = resolvePaths(input);
	const releaseSource = readOnlyLocks(paths.source);
	let releaseTarget: (() => void) | undefined;
	try {
		assertHomeImportReady(paths.source);
		assertNoLiveProcesses(paths.source);
		const plan = await scan(paths.source, paths.target);
		if (plan.version !== input.expectedVersion)
			throw new Error("The source changed. Preview the home import again and use its current version.");
		resolvePaths(paths);
		if (!existsSync(paths.target)) mkdirSync(paths.target, { mode: 0o700 });
		releaseTarget = lockHome(paths.target, "restore", null).release;
		if (readdirSync(paths.target).some((name) => name !== "trellis.lock"))
			throw new Error(`Target ${paths.target} must be empty.`);
		chmodSync(paths.target, 0o700);
		const marker = join(paths.target, "import-in-progress.json");
		const staged = join(paths.target, ".home-import-stage");
		const id = randomUUID();
		writeJson(marker, { id, ...paths, version: plan.version, state: "copying", createdAt: now.toISOString() }, true);
		syncDirectory(paths.target);
		syncDirectory(dirname(paths.target));
		mkdirSync(staged, { mode: 0o700 });
		await copyEntries(paths.source, staged, plan.entries);
		if ((await scan(paths.source, paths.target)).version !== plan.version)
			throw new Error("Source changed during import. Archive this incomplete target, then preview the source again.");
		const database = await openDatabase(join(staged, "db"));
		let original: ImportInventory;
		try {
			original = await database.db.transaction((tx) => prepare(tx, now));
		} finally {
			await database.close();
		}
		const result: HomeImportResult = {
			id,
			state: "prepared",
			createdAt: now.toISOString(),
			...paths,
			version: plan.version,
			files: plan.entries.filter((entry) => entry.kind !== "directory").length,
			bytes: plan.bytes,
			excluded: plan.excluded,
			...original,
		};
		if (existsSync(join(staged, "import-provenance.json")))
			renameSync(join(staged, "import-provenance.json"), join(staged, `import-provenance.previous-${id}.json`));
		for (const entry of readdirSync(staged)) renameSync(join(staged, entry), join(paths.target, entry));
		rmdirSync(staged);
		syncDirectory(paths.target);
		writeJson(join(paths.target, "import-provenance.json"), result, true);
		syncDirectory(paths.target);
		unlinkSync(marker);
		syncDirectory(paths.target);
		return result;
	} finally {
		releaseTarget?.();
		releaseSource();
	}
};
