import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../testDb.ts";
import { answeredQuestions } from "./answeredQuestion.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const root = ulid();
const todo = ulid();
const done = ulid();
// OP-33 waits for OP-52 and OP-53, both answered, and for OP-54, which is
// done with no option list.
const tickets = Array.from({ length: 4 }, () => ulid());
const at = new Date("2026-09-20T10:00:00.000Z");
const later = new Date("2026-09-20T11:00:00.000Z");

const question = "Options:\n1. Leave missed\n2. Run late\n3. Wider grace";

const comment = (ticketId: string, body: string, kind: string, name: string, when: Date) =>
	db.execute(sql`INSERT INTO comments (id, ticket_id, body, actor_name, actor_kind, created_at, updated_at)
		VALUES (${ulid()}, ${ticketId}, ${body}, ${name}, ${kind}, ${when}, ${when})`);

const answers = () => db.transaction((tx) => answeredQuestions(tx, tickets[0] as string));

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${root}, ${root}, 'OP', 'op', 'Operator', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES
		(${todo}, ${root}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true, ${at}, ${at}),
		(${done}, ${root}, 'Done', 'done', 'done', NULL, 'success', 1, false, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, root_id, number, title, description, status_id, outcome, position, created_at, updated_at)
		VALUES
		(${tickets[0]}, ${root}, ${root}, 33, 'Continue the sweep', '', ${todo}, '', 0, ${at}, ${at}),
		(${tickets[1]}, ${root}, ${root}, 52, 'Run late or leave missed', ${question}, ${done}, '', 1, ${at}, ${at}),
		(${tickets[2]}, ${root}, ${root}, 53, 'One queue or one per routine', ${question}, ${done}, '', 2, ${at}, ${at}),
		(${tickets[3]}, ${root}, ${root}, 54, 'Review without options', '', ${done}, '', 3, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at) VALUES
		(${tickets[0]}, ${tickets[1]}, 'manual', ${at}),
		(${tickets[0]}, ${tickets[2]}, 'manual', ${at}),
		(${tickets[0]}, ${tickets[3]}, 'manual', ${at})`);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES
		('navid', 'human', ${at}, ${at}),
		('crisp-fjord', 'agent', ${at}, ${at})`);
	await comment(tickets[1] as string, "Answer: option 1. A missed night must stay visible.", "human", "navid", at);
	await comment(tickets[2] as string, "Answer: option 2. One queue per routine.", "human", "navid", at);
	await comment(tickets[3] as string, "Looks right to me.", "human", "navid", at);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("names every answered question in ticket number order", async () => {
	expect(await answers()).toEqual([
		{ identifier: "OP-52", title: "Run late or leave missed", option: 1 },
		{ identifier: "OP-53", title: "One queue or one per routine", option: 2 },
	]);
});

test("reports nothing for a ticket that waits on no answered question", async () => {
	expect(await db.transaction((tx) => answeredQuestions(tx, tickets[1] as string))).toEqual([]);
});

test("reads no answer out of a comment that only starts like one", async () => {
	await comment(tickets[1] as string, "Answer: option 3 is best, but I took 1.", "human", "navid", later);

	expect(await answers()).toMatchObject([{ identifier: "OP-52", option: 1 }, { identifier: "OP-53" }]);
});

test("reads no answer out of a number that no option can carry", async () => {
	await comment(tickets[2] as string, "Answer: option 99999999999. why", "human", "navid", later);

	expect(await answers()).toMatchObject([{ identifier: "OP-52" }, { identifier: "OP-53", option: 2 }]);
});

test("reads no answer out of a comment that an agent wrote", async () => {
	await comment(tickets[2] as string, "Answer: option 3. An agent cannot answer.", "agent", "crisp-fjord", later);

	expect(await answers()).toMatchObject([{ identifier: "OP-52" }, { identifier: "OP-53", option: 2 }]);
});

test("takes the newest answer when a person answered twice", async () => {
	await comment(tickets[1] as string, "Answer: option 3. A wider grace is enough.", "human", "navid", later);

	expect(await answers()).toMatchObject([{ identifier: "OP-52", option: 3 }, { identifier: "OP-53" }]);
});
