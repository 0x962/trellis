import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../db/testDb.ts";
import type { Tx } from "../db/tx.ts";
import type { IoCtx } from "./support.ts";
import { exportNdjson } from "./system.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const at = new Date("2026-09-24T20:00:00.000Z");

beforeAll(async () => {
	db = await openTestDb();
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("redacts provider keys from the data export", async () => {
	const id = ulid();
	await db.execute(sql`INSERT INTO providers (id, name, kind, base_url, api_key, enabled, created_at, updated_at)
		VALUES (${id}, 'Export provider', 'openai-compatible', 'https://models.example.com', 'export-secret', false, ${at}, ${at})`);
	const [stored] = (await db.execute(sql`SELECT * FROM providers WHERE id = ${id}`)).rows as Array<
		Record<string, unknown>
	>;
	const lines: string[] = [];
	const ctx = { now: () => at } as unknown as IoCtx;
	await db.transaction(async (tx: Tx) => {
		for await (const line of exportNdjson(ctx, tx, {})) lines.push(line);
	});
	const provider = lines
		.map((line) => JSON.parse(line) as { table?: string; row?: Record<string, unknown> })
		.find((line) => line.table === "providers")?.row;
	expect(provider).toEqual({ ...stored!, api_key: "<redacted>" });
	expect(lines.join("")).not.toContain("export-secret");
});

test("exports complete pages for all exclusion identities", async () => {
	await db.$client.exec(`
		INSERT INTO projects (id,key,slug,name,created_at,updated_at)
		VALUES ('export-project','EX','export-project','Export',now(),now());
		INSERT INTO statuses (id,project_id,name,slug,category,color,position,created_at,updated_at)
		VALUES ('export-status','export-project','Todo','todo','todo','gray',0,now(),now());
		INSERT INTO tickets (id,project_id,number,title,status_id,position,created_at,updated_at)
		VALUES ('export-ticket','export-project',1,'Export','export-status',0,now(),now());
		INSERT INTO agent_runs (id,name,kind,instruction,project_key,created_at,updated_at)
		VALUES ('export-agent','Export','session','Export','EX',now(),now());
		INSERT INTO flow_executions
			(id,flow_id,ticket_id,project_id,actor_kind,actor_name,request_id,request,doc,state,revision,created_at,updated_at)
		VALUES ('export-execution','export-flow','export-ticket','export-project','human','Export','export','{}','{}','{}',1,now(),now());
		INSERT INTO providers (id,name,kind,base_url,api_key,created_at,updated_at) VALUES
			('export-provider-a','Export A','openai-compatible','https://example.test','provider-secret-a',now(),now()),
			('export-provider-b','Export B','openai-compatible','https://example.test','provider-secret-b',now(),now());
	`);
	const prefix = randomBytes(2048).toString("hex");
	await db.$client.query(
		`INSERT INTO provider_models (provider_id,model_id)
		 SELECT provider,$1 || lpad(n::text,4,'0')
		 FROM (VALUES ('export-provider-a'),('export-provider-b')) AS p(provider),generate_series(1,501) AS n`,
		[prefix],
	);
	await db.$client.query(
		`INSERT INTO agent_start_requests (actor_kind,actor_name,request_id,run_id,target,created_at)
		 SELECT kind,$1,$1 || lpad(n::text,4,'0'),'export-agent','{}',now()
		 FROM (VALUES ('human'),('agent')) AS a(kind),generate_series(1,501) AS n`,
		[prefix],
	);
	await db.$client.query(
		`INSERT INTO langflow_start_receipts
		 (actor_kind,actor_name,request_id,request_bytes,execution_id,legacy_execution_id)
		 SELECT kind,$1,$1 || lpad(n::text,4,'0'),'receipt','export-execution','export-execution'
		 FROM (VALUES ('human'),('agent')) AS a(kind),generate_series(1,501) AS n`,
		[prefix],
	);
	const keys: Record<string, string[]> = {
		provider_models: ["provider_id", "model_id"],
		agent_start_requests: ["actor_kind", "actor_name", "request_id"],
		langflow_start_receipts: ["actor_kind", "actor_name", "request_id"],
	};
	const exported = new Map(Object.keys(keys).map((table) => [table, [] as Record<string, unknown>[]]));
	const ctx = { now: () => at } as unknown as IoCtx;
	await db.transaction(async (tx: Tx) => {
		for await (const line of exportNdjson(ctx, tx, {})) {
			const record = JSON.parse(line) as { table: string; row: Record<string, unknown> };
			exported.get(record.table)?.push(record.row);
			expect(line).not.toContain("provider-secret-");
		}
		for (const [table, columns] of Object.entries(keys)) {
			const expected = await tx.execute(
				sql`SELECT * FROM ${sql.identifier(table)} ORDER BY ${sql.join(
					columns.map((column) => sql.identifier(column)),
					sql`, `,
				)}`,
			);
			expect(exported.get(table)).toHaveLength(1002);
			expect(exported.get(table)).toEqual(JSON.parse(JSON.stringify(expected.rows)));
		}
	});
}, 60_000);
