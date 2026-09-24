import { afterAll, beforeAll, expect, test } from "bun:test";
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
