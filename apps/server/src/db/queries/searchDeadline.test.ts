import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Db } from "../client.ts";
import { openTestDb } from "../testDb.ts";
import { search } from "./search.ts";

let db: Db;

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES ('deadline-project', 'DEADLINE', 'deadline', 'Deadline', now(), now())`);
	await db.execute(sql`INSERT INTO statuses (id, project_id, name, slug, category, color, position, created_at, updated_at)
		VALUES ('deadline-status', 'deadline-project', 'Todo', 'todo', 'todo', 'fg-muted', 0, now(), now())`);
	await db.execute(sql`INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES ('deadline-ticket', 'deadline-project', 1, 'Slow search', 'deadline-status', 0, now(), now())`);
	await db.execute(sql`ALTER FUNCTION pg_temp.search_identifier(text, int, text, int)
		RENAME TO search_identifier_without_delay`);
	await db.execute(sql`CREATE FUNCTION pg_temp.search_identifier(text, int, text, int)
		RETURNS SETOF search_row LANGUAGE plpgsql AS $body$
		BEGIN
			PERFORM pg_sleep(0.3);
			RETURN QUERY SELECT * FROM pg_temp.search_identifier_without_delay($1, $2, $3, $4);
		END $body$`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("a valid search takes more than 200 ms and returns its result", async () => {
	const started = performance.now();
	const found = await db.transaction(async (tx) => {
		const result = await search(tx, { q: "DEADLINE-1", limit: 1 });
		expect((await tx.execute(sql`SHOW statement_timeout`)).rows).toEqual([{ statement_timeout: "0" }]);
		return result;
	});

	expect(performance.now() - started).toBeGreaterThanOrEqual(300);
	expect(found.tickets.map((ticket) => ticket.identifier)).toEqual(["DEADLINE-1"]);
	expect(found.projects).toEqual([]);
});

test("caller cancellation after a search rolls back its transaction and releases the database", async () => {
	const controller = new AbortController();
	const canceled = db.transaction(async (tx) => {
		await tx.execute(sql`UPDATE tickets SET title = 'Uncommitted title' WHERE id = 'deadline-ticket'`);
		await search(tx, { q: "DEADLINE-1" });
		controller.abort(new Error("Search canceled"));
		controller.signal.throwIfAborted();
	});
	await expect(canceled).rejects.toThrow("Search canceled");

	const found = await db.transaction((tx) => search(tx, { q: "DEADLINE-1" }));
	expect(found.tickets[0]?.title).toBe("Slow search");
	expect((await db.execute(sql`SHOW statement_timeout`)).rows).toEqual([{ statement_timeout: "0" }]);
});

test("text searches preserve an explicit caller timeout and result limit", async () => {
	await db.transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
		const found = await search(tx, { q: "slow", limit: 1 });
		expect(found.tickets.map((ticket) => ticket.identifier)).toEqual(["DEADLINE-1"]);
		expect((await tx.execute(sql`SHOW statement_timeout`)).rows).toEqual([{ statement_timeout: "5s" }]);
	});
});
