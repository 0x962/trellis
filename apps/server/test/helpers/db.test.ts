import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { seedActivity, seedActor, seedRoot } from "../fixtures";
import { freshDb, type TestDb } from "./db.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
afterAll(() => h.close());

const rowCounts = async () => {
	const tables = await h.db.execute(
		sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
	);
	const counts: Record<string, number> = {};
	for (const row of tables.rows) {
		const name = row.table_name as string;
		const result = await h.db.execute(sql`SELECT count(*)::int AS n FROM ${sql.identifier(name)}`);
		counts[name] = result.rows[0]?.n as number;
	}
	return counts;
};

describe("freshDb", () => {
	test("freshDb migrates an in-memory PGlite and reset truncates every table", async () => {
		const rootId = await seedRoot(h.db, "CDE");
		await seedActor(h.db, { name: "dana", kind: "human" });
		expect(await seedActivity(h.db, { rootId, projectId: rootId })).toBe(1);
		await h.reset();
		const counts = await rowCounts();
		expect(Object.keys(counts).length).toBeGreaterThanOrEqual(11);
		expect(Object.values(counts).every((n) => n === 0)).toBe(true);

		const again = await seedRoot(h.db, "CDE");
		await seedActor(h.db, { name: "dana", kind: "human" });
		expect(await seedActivity(h.db, { rootId: again, projectId: again })).toBe(1);
		const trigram = await h.db.execute(sql`SELECT 'a' <% 'ab' AS similar`);
		expect(trigram.rows[0]?.similar).toBe(true);
	});
});
