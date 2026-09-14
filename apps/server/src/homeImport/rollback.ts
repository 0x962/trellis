import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openDatabase } from "../db/open.ts";
import { copyEntries } from "./copy.ts";
import { syncDirectory } from "./durable.ts";
import { inspect } from "./inspect.ts";
import { canonicalTarget, inside } from "./paths.ts";
import { assertNoLiveProcesses } from "./processes.ts";
import { readOnlyLocks } from "./readOnlyLocks.ts";
import { scan } from "./scan.ts";
export const rollback = async (input: { target: string; archive: string }) => {
	const target = realpathSync(input.target);
	const archive = canonicalTarget(input.archive);
	if (dirname(archive) !== dirname(target) || inside(target, archive) || inside(archive, target))
		throw new Error("The archive must be an unused sibling of the imported home.");
	if (existsSync(archive)) throw new Error(`Archive ${archive} already exists. Choose an unused path.`);
	const marker = join(target, "import-in-progress.json");
	const provenance = join(target, "import-provenance.json");
	if (!existsSync(marker) && !existsSync(provenance))
		throw new Error(`Target ${target} has no home import provenance.`);
	const source = existsSync(marker)
		? null
		: (JSON.parse(readFileSync(provenance, "utf8")) as { source: string }).source;
	const release = readOnlyLocks(target);
	let scratch: string | undefined;
	try {
		assertNoLiveProcesses(target);
		if (!existsSync(marker)) {
			const plan = await scan(target, archive);
			scratch = mkdtempSync(join(tmpdir(), "trellis-import-rollback-"));
			await copyEntries(
				target,
				scratch,
				plan.entries.filter((entry) => entry.path === "db" || entry.path.startsWith("db/")),
			);
			const database = await openDatabase(join(scratch, "db"));
			try {
				const inventory = await database.db.transaction(inspect);
				if (inventory.blockers.length) throw new Error(inventory.blockers.join(" "));
			} finally {
				await database.close();
			}
		}
		mkdirSync(archive, { mode: 0o700 });
		renameSync(target, archive);
		syncDirectory(dirname(target));
		syncDirectory(dirname(archive));
		return { target, archive, state: "archived" as const, source };
	} finally {
		if (scratch) rmSync(scratch, { recursive: true, force: true });
		release();
	}
};
