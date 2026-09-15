import { afterAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";

const drizzleDir = join(originDir(import.meta.dir), "../../drizzle");
const closers: Array<() => Promise<void>> = [];

afterAll(async () => {
	for (const close of closers) await close();
});

// A copy of the migration folder, so a test edits its journal and leaves the
// folder of the repository alone.
const folder = () => {
	const temp = mkdtempSync(join(process.env.TRELLIS_HOME!, "journal-migration-"));
	cpSync(drizzleDir, temp, { recursive: true });
	return temp;
};
const journalOf = (temp: string) =>
	JSON.parse(readFileSync(join(temp, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string; when: number }[];
	};
const applied = async (db: Awaited<ReturnType<typeof openDb>>) =>
	((await db.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0] as { n: number }).n;

// drizzle decides what to apply from the `when` of a journal entry, not from
// the file name and not from the hash. It keeps only the highest
// `created_at` of its log, so a raised `when` on the newest entry puts that
// entry in front of the log again and its statements run a second time.
test("a raised when on the newest migration runs that migration a second time", async () => {
	const temp = folder();
	const db = await openDb(":memory:");
	closers.push(() => db.$client.close());
	await migrate(db, temp);
	const before = await applied(db);
	const journal = journalOf(temp);
	const newest = journal.entries[journal.entries.length - 1]!;
	newest.when += 1;
	writeFileSync(join(temp, "meta/_journal.json"), JSON.stringify(journal));

	// The message names whatever the newest migration creates, so this matches
	// the part that says it ran twice and not the object of one migration.
	await expect(migrate(db, temp)).rejects.toThrow(/already exists/);

	expect(await applied(db)).toBe(before);
});

// The journal of a migration that has run is append-only: its `tag` and its
// `when` are what a database compares itself against. This list freezes both
// for every entry, so an edit at any position fails here and not on the
// machine of whoever installs next. A new migration appends one line, and
// its `when` must be above every `when` that a database may already hold.
const FROZEN_JOURNAL = [
	"0:0000_extensions:1788989200146",
	"1:0001_init:1788989927285",
	"2:0002_constraints:1788989927602",
	"3:0003_tickets_restrict:1788997454532",
	"4:0004_read_indexes:1789047283046",
	"5:0005_agents:1789067784054",
	"6:0006_status_descriptions:1789067784401",
	"7:0007_agent_failures:1789074694619",
	"8:0008_board_updated_index:1789083295316",
	"12:0012_agent_names:1789085671637",
	"13:0013_remove_agents:1789090657563",
	"14:0014_elite_tag:1789091936992",
	"15:0015_comment_threads:1789092657977",
	"16:0016_exotic_human_fly:1789093392416",
	"17:0017_volatile_mephisto:1789094448267",
	"18:0018_deep_the_hand:1789095714204",
	"19:0019_legal_lyja:1789098060318",
	"20:0020_restore_agents:1789099234298",
	"21:0021_white_pyro:1789140757700",
	"22:0022_fix_manager_launch:1789143314838",
	"23:0023_target_launch_template:1789177878741",
	"24:0024_abandoned_misty_knight:1789181428783",
	"25:0025_awesome_scourge:1789182338806",
	"26:0026_manager_session:1789185106775",
	"27:0027_flow_groups:1789190213054",
	"28:0028_useful_cyclops:1789214904867",
	"29:0029_manager_controller:1789411873538",
	"30:0030_agent_assignments:1789412554275",
	"31:0031_agent_harness_observations:1789413328880",
	"32:0032_workspace_evidence:1789413803864",
	"33:0033_agent_harness_checkpoints:1789414231512",
	"34:0034_native_flow_executions:1789415265714",
	"35:0035_native_project_migrations:1789416496572",
	"36:0036_native_runtime_default:1789441318031",
	"37:0037_agent_assignment_closure:1789490003565",
	"38:0038_persona_color:1789491936900",
];

test("the journal of every migration keeps its tag and its when", () => {
	const entries = journalOf(folder()).entries.map((entry) => `${entry.idx}:${entry.tag}:${entry.when}`);
	expect(entries).toEqual(FROZEN_JOURNAL);
});
