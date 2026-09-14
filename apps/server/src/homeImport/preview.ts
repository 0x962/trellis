import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../db/open.ts";
import { assertHomeImportReady } from "./bootGuard.ts";
import { copyEntries } from "./copy.ts";
import { inspect } from "./inspect.ts";
import { resolvePaths } from "./paths.ts";
import { assertNoLiveProcesses } from "./processes.ts";
import { readOnlyLocks } from "./readOnlyLocks.ts";
import { scan } from "./scan.ts";
import type { HomeImportPaths, HomeImportPreview } from "./types.ts";
export const preview = async (input: HomeImportPaths): Promise<HomeImportPreview> => {
	const paths = resolvePaths(input);
	const release = readOnlyLocks(paths.source);
	let scratch: string | undefined;
	try {
		assertHomeImportReady(paths.source);
		assertNoLiveProcesses(paths.source);
		const plan = await scan(paths.source, paths.target);
		scratch = await mkdtemp(join(tmpdir(), "trellis-import-preview-"));
		await copyEntries(
			paths.source,
			scratch,
			plan.entries.filter((entry) => entry.path === "db" || entry.path.startsWith("db/")),
		);
		const database = await openDatabase(join(scratch, "db"));
		try {
			return {
				...paths,
				version: plan.version,
				files: plan.entries.filter((entry) => entry.kind !== "directory").length,
				bytes: plan.bytes,
				excluded: plan.excluded,
				...(await database.db.transaction(inspect)),
			};
		} finally {
			await database.close();
		}
	} finally {
		if (scratch) await rm(scratch, { recursive: true, force: true });
		release();
	}
};
