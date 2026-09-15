import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { freshDb, type TestDb } from "../../../helpers/db.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
afterAll(() => h.close());

test("agent assignments retain closure facts without a database process status", async () => {
	const result = await h.db.execute(
		sql`SELECT column_name FROM information_schema.columns WHERE table_name='agent_runs'`,
	);
	const columns = result.rows.map((row) => row.column_name);
	expect(columns).toContain("closed_at");
	expect(columns).not.toContain("state");
});
