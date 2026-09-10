import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

describe("openDb", () => {
	// `<%` is the word-similarity operator that pg_trgm defines. The CREATE
	// EXTENSION needs the extension files that the PGlite constructor loads.
	test("openDb builds PGlite with the pg_trgm extension", async () => {
		const db = await openDb(":memory:");
		await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
		const result = await db.execute(sql`SELECT 'auth' <% 'authentication' AS similar`);
		expect(result.rows[0]?.similar).toBe(true);
		await db.$client.close();
	});

	test("openDb with a data dir persists rows across a reopen", async () => {
		const dataDir = mkdtempSync(join(process.env.TRELLIS_HOME as string, "pglite-"));
		const first = await openDb(dataDir);
		await migrate(first);
		await first.execute(sql`INSERT INTO settings (key, value, updated_at) VALUES ('stalledHours', '48', now())`);
		await first.$client.close();

		const second = await openDb(dataDir);
		const result = await second.execute(sql`SELECT key, value FROM settings`);
		expect(result.rows).toEqual([{ key: "stalledHours", value: 48 }]);
		await second.$client.close();
	});
});
