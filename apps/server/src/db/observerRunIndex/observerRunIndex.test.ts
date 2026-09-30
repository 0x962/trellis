import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { observerConversationIdentities } from "../../services/agentRuns/observerRuns";
import { listUsageRuns } from "../../services/usage/queries.ts";
import { type Db, openDb } from "../client.ts";
import { migrate } from "../migrate.ts";

const migrations = join(import.meta.dir, "../../../drizzle");
const indexName = "agent_start_requests_observer_run_idx";

async function history(directory: string, through: number) {
	const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const entries = journal.entries.filter((entry) => entry.idx <= through);
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries)
		await copyFile(join(migrations, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
}

async function requests(tx: Db) {
	return (await tx.$client.query("SELECT * FROM agent_start_requests ORDER BY actor_kind,actor_name,request_id")).rows;
}

async function usage(tx: Db) {
	const runs = await tx.transaction((tx) => listUsageRuns(tx, "/fixture", new Date("2026-09-01")));
	return runs.map((run) => JSON.stringify(run)).sort();
}

test("0148 preserves observer history and uses the run index for each Usage lookup", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-observer-index-"));
	const db = await openDb(":memory:");
	try {
		await mkdir(join(directory, "meta"));
		await history(directory, 147);
		await runMigrations(db, { migrationsFolder: directory });
		await db.$client.exec(`
			INSERT INTO agent_runs (id,name,kind,instruction,project_key,session_id,created_at,updated_at)
			SELECT 'run-'||i,'Worker '||i,'session','Test Usage.','TEST','current-'||i,now(),now()
			FROM generate_series(1,500) i;
			INSERT INTO agent_start_requests (request_id,actor_name,actor_kind,run_id,target,created_at)
			SELECT 'request-'||i,'worker','agent','run-'||i,'{}',now() FROM generate_series(1,500) i;
			INSERT INTO agent_start_requests (request_id,actor_name,actor_kind,run_id,target,created_at)
			SELECT 'observer-'||i,'session-observer','system','run-'||i,
				jsonb_build_object('providerSessionId','previous-'||i),now() FROM generate_series(1,50) i;
			INSERT INTO agent_start_requests (request_id,actor_name,actor_kind,run_id,target,created_at)
			VALUES ('duplicate','session-observer','system','run-1','{"providerSessionId":"current-1"}',now()),
				('different-kind','session-observer','agent','run-1','{"providerSessionId":"exclude-kind"}',now()),
				('different-name','other-system','system','run-1','{"providerSessionId":"exclude-name"}',now());
			ANALYZE agent_runs;
			ANALYZE agent_start_requests;
		`);
		const before = await requests(db);
		const beforeUsage = await usage(db);
		expect(beforeUsage).toHaveLength(550);
		await history(directory, 148);
		await runMigrations(db, { migrationsFolder: directory });
		expect(await requests(db)).toEqual(before);
		expect(await usage(db)).toEqual(beforeUsage);
		const plan = await db.execute(sql`EXPLAIN (ANALYZE, FORMAT JSON)
			SELECT r.id, identities.session_id FROM agent_runs r
			LEFT JOIN LATERAL (${observerConversationIdentities(sql`r.id`, sql`r.session_id`)}) identities ON true`);
		const nodes: Record<string, unknown>[] = [];
		const visit = (node: Record<string, unknown>) => {
			nodes.push(node);
			for (const child of (node.Plans ?? []) as Record<string, unknown>[]) visit(child);
		};
		const result = plan.rows[0]!["QUERY PLAN"] as { Plan: Record<string, unknown> }[];
		visit(result[0]!.Plan);
		expect(nodes.find((node) => node["Index Name"] === indexName)?.["Actual Loops"]).toBe(500);
		expect(
			nodes.some((node) => node["Relation Name"] === "agent_start_requests" && node["Node Type"] === "Seq Scan"),
		).toBe(false);
		await runMigrations(db, { migrationsFolder: directory });
		expect(await requests(db)).toEqual(before);
	} finally {
		await db.$client.close();
		await rm(directory, { recursive: true });
	}
}, 60_000);

test("a fresh database installs the observer index and does not reapply migrations", async () => {
	const db = await openDb(":memory:");
	try {
		await migrate(db);
		const result = await db.$client.query("SELECT indexname FROM pg_indexes WHERE indexname=$1", [indexName]);
		expect(result.rows).toEqual([{ indexname: indexName }]);
		expect(await migrate(db)).toBe(0);
	} finally {
		await db.$client.close();
	}
}, 60_000);
