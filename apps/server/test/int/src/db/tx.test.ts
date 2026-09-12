import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ownerOf } from "../../../../src/db/queries/effectiveStatuses.ts";
import { withTx } from "../../../../src/db/tx.ts";
import { count, seedRoot } from "../../../fixtures";
import { freshDb, type TestDb } from "../../../helpers/db.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

describe("withTx", () => {
	test("withTx returns the result and the queued events after commit", async () => {
		let id = "";
		const outcome = await withTx(h.db, async (tx, emit) => {
			id = await seedRoot(tx, "CDE");
			emit({ type: "project.created", id });
			return "ok";
		});
		expect(outcome).toEqual({ result: "ok", events: [{ type: "project.created", id }] });
		expect(await count(h.db, "projects")).toBe(1);
	});

	test("withTx rolls back and drops the events on a throw", async () => {
		const delivered: TrellisEvent[][] = [];
		const run = withTx(
			h.db,
			async (tx, emit) => {
				const id = await seedRoot(tx, "CDE");
				emit({ type: "project.created", id });
				throw new Error("boom");
			},
			(events) => {
				delivered.push(events);
			},
		);
		await expect(run).rejects.toThrow("boom");
		expect(await count(h.db, "projects")).toBe(0);
		expect(delivered).toEqual([]);
	});

	// An in-memory PGlite is one connection. A sink that queries the database
	// while the transaction is still open waits on the lock the transaction
	// holds, and the test times out. A sink that runs after the commit sees
	// the row and returns at once.
	test("withTx flushes events only after the commit", async () => {
		let fnReturned = false;
		const observed: Array<{ fnReturned: boolean; projects: number }> = [];
		await withTx(
			h.db,
			async (tx, emit) => {
				const id = await seedRoot(tx, "CDE");
				emit({ type: "project.created", id });
				fnReturned = true;
				return id;
			},
			async () => {
				observed.push({ fnReturned, projects: await count(h.db, "projects") });
			},
		);
		expect(observed).toEqual([{ fnReturned: true, projects: 1 }]);
	}, 2000);

	test("nested queries through tx complete inside withTx within 2 seconds", async () => {
		const { result } = await withTx(h.db, async (tx) => {
			const root = await seedRoot(tx, "CDE");
			const rows = await tx.execute(sql`SELECT id FROM projects WHERE id = ${root}`);
			const owner = await ownerOf(tx, root);
			return { found: rows.rows.length, owner };
		});
		expect(result).toEqual({ found: 1, owner: null });
	}, 2000);
});
