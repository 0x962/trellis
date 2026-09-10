import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createMaintenance } from "./maintenance.ts";

// A database stand-in that records the text of every statement instead of
// running it. Maintenance needs `execute` only.
const recordingDb = () => {
	const statements: string[] = [];
	const dialect = new PgDialect();
	const db = {
		execute: async (query: SQL) => {
			statements.push(dialect.sqlToQuery(query).sql.replaceAll('"', "").replace(/\s+/g, " ").trim());
			return { rows: [] };
		},
	};
	return { db, statements };
};

const vacuums = ["VACUUM (ANALYZE) tickets", "VACUUM (ANALYZE) activity", "VACUUM (ANALYZE) comments"];

describe("maintenance", () => {
	test("tick vacuums the three tables only after more than 1000 writes and resets the counter", async () => {
		const { db, statements } = recordingDb();
		const maintenance = createMaintenance(db);
		maintenance.recordWrites(1000);
		await maintenance.tick();
		expect(statements).toEqual([]);
		expect(maintenance.pendingWrites).toBe(1000);
		maintenance.recordWrites(1);
		await maintenance.tick();
		expect(statements).toEqual(vacuums);
		expect(maintenance.pendingWrites).toBe(0);
	});

	test("runNow vacuums regardless of the counter", async () => {
		const { db, statements } = recordingDb();
		const maintenance = createMaintenance(db);
		maintenance.recordWrites(3);
		await maintenance.runNow();
		expect(statements).toEqual(vacuums);
		expect(maintenance.pendingWrites).toBe(0);
	});
});
