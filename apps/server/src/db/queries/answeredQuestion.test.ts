import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../testDb.ts";
import { answeredQuestion } from "./answeredQuestion.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const root = ulid();
const todo = ulid();
const review = ulid();
const done = ulid();
// OP-33 waits for OP-52, which is answered, and for OP-53, which is a human
// review with no option list.
const tickets = Array.from({ length: 3 }, () => ulid());
const comments = Array.from({ length: 2 }, () => ulid());
const at = new Date("2026-09-20T10:00:00.000Z");
const later = new Date("2026-09-20T11:00:00.000Z");

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${root}, ${root}, 'OP', 'op', 'Operator', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES
		(${todo}, ${root}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true, ${at}, ${at}),
		(${review}, ${root}, 'Human Review', 'human-review', 'review', 'human', 'warning', 1, false, ${at}, ${at}),
		(${done}, ${root}, 'Done', 'done', 'done', NULL, 'success', 2, false, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, root_id, number, title, description, status_id, outcome, position, created_at, updated_at)
		VALUES
		(${tickets[0]}, ${root}, ${root}, 33, 'Continue the sweep', '', ${todo}, '', 0, ${at}, ${at}),
		(${tickets[1]}, ${root}, ${root}, 52, 'Run late or leave missed', E'Options:\\n1. Leave missed\\n2. Run late',
			${done}, '', 1, ${at}, ${at}),
		(${tickets[2]}, ${root}, ${root}, 53, 'Review without options', '', ${done}, '', 2, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at) VALUES
		(${tickets[0]}, ${tickets[1]}, 'manual', ${at}),
		(${tickets[0]}, ${tickets[2]}, 'manual', ${at})`);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('navid', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO comments (id, ticket_id, body, actor_name, actor_kind, created_at, updated_at)
		VALUES
		(${comments[0]}, ${tickets[1]}, 'Answer: option 1. A missed night must stay visible.',
			'navid', 'human', ${at}, ${at}),
		(${comments[1]}, ${tickets[2]}, 'Looks right to me.', 'navid', 'human', ${at}, ${at})`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("names the answered question and the option that was picked", async () => {
	expect(await db.transaction((tx) => answeredQuestion(tx, tickets[0] as string))).toEqual({
		identifier: "OP-52",
		title: "Run late or leave missed",
		option: 1,
	});
});

test("takes the newest answer when a person answered twice", async () => {
	await db.execute(sql`INSERT INTO comments (id, ticket_id, body, actor_name, actor_kind, created_at, updated_at)
		VALUES (${ulid()}, ${tickets[1]}, 'Answer: option 2. The late run keeps the work.',
			'navid', 'human', ${later}, ${later})`);

	expect(await db.transaction((tx) => answeredQuestion(tx, tickets[0] as string))).toMatchObject({ option: 2 });
});

test("reports nothing for a ticket that waits on no answered question", async () => {
	expect(await db.transaction((tx) => answeredQuestion(tx, tickets[1] as string))).toBeNull();
});
