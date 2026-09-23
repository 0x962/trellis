import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../testDb.ts";
import { chainRows } from "./chainRows.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const root = ulid();
const todo = ulid();
const review = ulid();
const done = ulid();
const tickets = Array.from({ length: 4 }, () => ulid());
const at = new Date("2026-09-20T10:00:00.000Z");

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${root}, 'OP', 'op', 'Operator', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES
		(${todo}, ${root}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true, ${at}, ${at}),
		(${review}, ${root}, 'Human Review', 'human-review', 'review', 'human', 'warning', 1, false, ${at}, ${at}),
		(${done}, ${root}, 'Done', 'done', 'done', NULL, 'success', 2, false, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, description, status_id, outcome, position, created_at, updated_at)
		VALUES
		(${tickets[0]}, ${root}, 29, 'Create the runtime', '', ${done},
			'The runtime writes one durable row.', 0, ${at}, ${at}),
		(${tickets[1]}, ${root}, 33, 'Continue the sweep', '', ${todo}, '', 1, ${at}, ${at}),
		(${tickets[2]}, ${root}, 52, 'Run late or leave missed', '',
			${review}, '', 2, ${at}, ${at}),
		(${tickets[3]}, ${root}, 53, 'Review the sweep', '', ${review}, '', 3, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at) VALUES
		(${tickets[1]}, ${tickets[0]}, 'manual', ${at}),
		(${tickets[1]}, ${tickets[2]}, 'manual', ${at}),
		(${tickets[1]}, ${tickets[3]}, 'manual', ${at})`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("returns each dependency in ticket order", async () => {
	expect(await db.transaction((tx) => chainRows(tx, tickets[1] as string))).toEqual([
		{
			identifier: "OP-29",
			title: "Create the runtime",
			status: "done",
			outcome: "The runtime writes one durable row.",
		},
		{
			identifier: "OP-52",
			title: "Run late or leave missed",
			status: "review",
			outcome: "",
		},
		{
			identifier: "OP-53",
			title: "Review the sweep",
			status: "review",
			outcome: "",
		},
	]);
});
