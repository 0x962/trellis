import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../testDb.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const runId = ulid();
const at = new Date("2026-09-29T20:00:00Z");

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO agent_runs (id,name,kind,instruction,project_key,created_at,updated_at)
		VALUES (${runId},'Request keys','session','Read','',${at},${at})`);
}, 60_000);
afterAll(async () => db.$client.close());

const insert = (requestId: string, actorName = "qa", actorKind = "human") =>
	db.execute(sql`INSERT INTO agent_start_requests (request_id,actor_name,actor_kind,run_id,target,created_at)
		VALUES (${requestId},${actorName},${actorKind},${runId},'{"newSession":false}',${at})`);

test("the forward migration preserves prior receipts and exact long key identity", async () => {
	await db.execute(sql`ALTER TABLE agent_start_requests DROP CONSTRAINT agent_start_requests_identity`);
	await db.execute(sql`DROP INDEX agent_start_requests_request_id_idx`);
	await db.execute(sql`ALTER TABLE agent_start_requests ADD CONSTRAINT agent_start_requests_actor_kind_actor_name_request_id_pk
		PRIMARY KEY (actor_kind, actor_name, request_id)`);
	await insert("old-request");
	const before = await db.execute(sql`SELECT * FROM agent_start_requests`);
	const migration = await readFile(new URL("../../../drizzle/0136_request_key_identity.sql", import.meta.url), "utf8");
	await db.transaction(async (tx) => {
		for (const statement of migration.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
	});
	expect((await db.execute(sql`SELECT * FROM agent_start_requests`)).rows).toEqual(before.rows);
	await expect(insert("old-request")).rejects.toMatchObject({ code: "23P01" });

	const prefix = randomBytes(8192).toString("hex");
	const key = `${prefix}a`;
	await insert(key);
	await insert(`${prefix}b`);
	await insert(key, "other");
	await insert(key, "qa", "agent");
	await insert(key, randomBytes(8192).toString("hex"));
	await expect(insert(key)).rejects.toMatchObject({ code: "23P01" });
	await insert("c", "ab");
	await insert("bc", "a");
	expect((await db.execute(sql`SELECT * FROM agent_start_requests`)).rows).toHaveLength(8);

	await db.transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL enable_seqscan = off`);
		const plan = await tx.execute(sql`EXPLAIN SELECT run_id FROM agent_start_requests
			WHERE actor_kind='human' AND actor_name='qa' AND request_id=${key}`);
		expect(JSON.stringify(plan.rows)).toContain("agent_start_requests_request_id_idx");
	});
	await db.execute(sql`DELETE FROM agent_runs WHERE id=${runId}`);
	expect((await db.execute(sql`SELECT * FROM agent_start_requests`)).rows).toEqual([]);
});
