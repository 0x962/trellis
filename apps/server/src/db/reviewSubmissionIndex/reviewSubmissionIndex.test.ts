import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { type Db, openDb } from "../client.ts";
import { migrate } from "../migrate.ts";
import { measure } from "./measure.ts";
import { longIdentity, prCount, seed } from "./seed.ts";

const migrations = join(import.meta.dir, "../../../drizzle");
const indexName = "review_submissions_pr_created_idx";

async function history(directory: string, through: number) {
	const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const entries = journal.entries.filter((entry) => entry.idx <= through);
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries)
		await copyFile(join(migrations, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
}

async function retained(tx: Db) {
	const saved: Record<string, unknown> = {};
	for (const table of ["pull_requests", "review_submissions", "actors", "review_threads"])
		saved[table] = (await tx.$client.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
	saved.constraints = (
		await tx.$client.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
			FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY conrelid, conname`)
	).rows;
	return saved;
}

function digest(value: unknown) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function identityChecks(tx: Db) {
	await expect(
		tx.execute(sql`INSERT INTO review_submissions (id, pr_id, request_id, actor, document, created_at)
			SELECT 'duplicate', pr_id, request_id, actor, document, created_at
			FROM review_submissions WHERE id='pr-0007-long-identity'`),
	).rejects.toMatchObject({ code: "23P01", constraint: "review_submissions_request_identity" });
	await tx.execute(sql`INSERT INTO review_submissions (id, pr_id, request_id, actor, document, created_at)
		VALUES ('new-long', 'pr-0008', ${longIdentity}, ${longIdentity}, '{"verdict":"approved"}', '2026-09-10'),
			('other-actor', 'pr-0007', ${longIdentity}, 'Agent reviewer', '{"verdict":"commented"}', '2026-09-10')`);
	const result = await tx.$client.query("SELECT actor, request_id FROM review_submissions WHERE id='new-long'");
	expect(result.rows).toEqual([{ actor: longIdentity, request_id: longIdentity }]);
}

test("0149 keeps complete PR results and uses the index for 1600 pull requests", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-review-index-"));
	const db = await openDb(":memory:");
	try {
		await mkdir(join(directory, "meta"));
		await history(directory, 148);
		await runMigrations(db, { migrationsFolder: directory });
		await db.transaction(seed);
		const saved = await retained(db);
		const before = await db.transaction(measure);
		expect(before.result).toHaveLength(prCount);
		const verdicts = [
			null,
			null,
			null,
			"approved",
			"changes_requested",
			"changes_requested",
			"approved",
			"approved",
		] as const;
		for (const pr of before.result) expect(pr.localVerdict, pr.id).toBe(verdicts[pr.number % 8]!);
		const scans = before.nodes.filter((node) => node["Relation Name"] === "review_submissions");
		expect(scans).toHaveLength(2);
		for (const node of scans) {
			expect(node["Node Type"]).toBe("Seq Scan");
			expect(node["Actual Loops"]).toBe(prCount);
		}
		await history(directory, 149);
		await runMigrations(db, { migrationsFolder: directory });
		await db.execute(sql`ANALYZE`);
		expect(await retained(db)).toEqual(saved);
		const after = await db.transaction(measure);
		expect(after.result).toEqual(before.result);
		const indexed = after.nodes.filter((node) => node["Index Name"] === indexName);
		expect(indexed).toHaveLength(2);
		for (const node of indexed) {
			expect(["Index Scan", "Bitmap Index Scan"]).toContain(node["Node Type"]);
			expect(node["Actual Loops"]).toBe(prCount);
		}
		expect(
			after.nodes.some((node) => node["Relation Name"] === "review_submissions" && node["Node Type"] === "Seq Scan"),
		).toBe(false);
		await runMigrations(db, { migrationsFolder: directory });
		expect(await retained(db)).toEqual(saved);
		await identityChecks(db);
		console.info(
			"REVIEW_INDEX_PROOF",
			JSON.stringify({
				prCount,
				submissionCount: (saved.review_submissions as unknown[]).length,
				constraints: (saved.constraints as unknown[]).length,
				before: { elapsedMs: before.elapsedMs, resultSha256: digest(before.result), plan: before.plan },
				after: { elapsedMs: after.elapsedMs, resultSha256: digest(after.result), plan: after.plan },
				retainedSha256: digest(saved),
				identityLength: longIdentity.length,
			}),
		);
	} finally {
		await db.$client.close();
		await rm(directory, { recursive: true });
	}
}, 120_000);

test("a fresh database installs the ordered index and retains request identity constraints", async () => {
	const db = await openDb(":memory:");
	try {
		await migrate(db);
		const result = await db.$client.query("SELECT indexdef FROM pg_indexes WHERE indexname=$1", [indexName]);
		expect(result.rows).toEqual([
			{
				indexdef: `CREATE INDEX ${indexName} ON public.review_submissions USING btree (pr_id, created_at DESC, id DESC)`,
			},
		]);
		await db.transaction(seed);
		await identityChecks(db);
		expect(await migrate(db)).toBe(0);
	} finally {
		await db.$client.close();
	}
}, 60_000);

test("0149 adds only the review index to the exact 0148 snapshot", async () => {
	const before = JSON.parse(await readFile(join(migrations, "meta/0148_snapshot.json"), "utf8"));
	const after = JSON.parse(await readFile(join(migrations, "meta/0149_snapshot.json"), "utf8"));
	expect(after.prevId).toBe(before.id);
	expect(after.id).not.toBe(before.id);
	expect(after.tables["public.review_submissions"].indexes[indexName].columns).toEqual([
		{ expression: "pr_id", isExpression: false, asc: true, nulls: "last" },
		{ expression: "created_at", isExpression: false, asc: false, nulls: "first" },
		{ expression: "id", isExpression: false, asc: false, nulls: "first" },
	]);
	delete after.tables["public.review_submissions"].indexes[indexName];
	expect({ ...after, id: before.id, prevId: before.prevId }).toEqual(before);
});
