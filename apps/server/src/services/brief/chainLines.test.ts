import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import { chainLines } from "./chainLines.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const root = ulid();
const todo = ulid();
const review = ulid();
const question = ulid();
const done = ulid();
const tickets = Array.from({ length: 8 }, () => ulid());
const at = new Date("2026-09-20T10:00:00.000Z");

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${root}, ${root}, 'OP', 'op', 'Operator', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES
		(${todo}, ${root}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true, ${at}, ${at}),
		(${review}, ${root}, 'Agent Review', 'agent-review', 'review', 'agent', 'accent', 1, false, ${at}, ${at}),
		(${question}, ${root}, 'Human Review', 'human-review', 'review', 'human', 'warning', 2, false, ${at}, ${at}),
		(${done}, ${root}, 'Done', 'done', 'done', NULL, 'success', 3, false, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, root_id, number, title, description, status_id, outcome, position, created_at, updated_at)
		VALUES
		(${tickets[0]}, ${root}, ${root}, 29, 'Create the runtime', '', ${done},
			'The runtime writes one durable row.', 0, ${at}, ${at}),
		(${tickets[1]}, ${root}, ${root}, 32, 'Open the chat', '', ${review}, '', 1, ${at}, ${at}),
		(${tickets[2]}, ${root}, ${root}, 33, 'Continue the sweep', '', ${review}, '', 2, ${at}, ${at}),
		(${tickets[3]}, ${root}, ${root}, 35, 'Close a stale run', '', ${todo}, '', 3, ${at}, ${at}),
		(${tickets[4]}, ${root}, ${root}, 40, 'Start an unattended run', '', ${todo}, '', 4, ${at}, ${at}),
		(${tickets[5]}, ${root}, ${root}, 52, 'Run late or leave missed', E'Options:\\n1. Leave missed\\n2. Run late',
			${question}, '', 5, ${at}, ${at}),
		(${tickets[6]}, ${root}, ${root}, 53, 'Print another chain', '', ${todo}, '', 6, ${at}, ${at}),
		(${tickets[7]}, ${root}, ${root}, 54, 'Stand alone', '', ${todo}, '', 7, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at) VALUES
		(${tickets[2]}, ${tickets[0]}, 'manual', ${at}),
		(${tickets[2]}, ${tickets[1]}, 'manual', ${at}),
		(${tickets[2]}, ${tickets[5]}, 'manual', ${at}),
		(${tickets[3]}, ${tickets[2]}, 'manual', ${at}),
		(${tickets[4]}, ${tickets[2]}, 'manual', ${at}),
		(${tickets[6]}, ${tickets[1]}, 'manual', ${at})`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("prints the four chain lines in order and includes a finished outcome", async () => {
	expect(await db.transaction((tx) => chainLines(tx, tickets[2] as string))).toEqual([
		"## Chain",
		"",
		"- Waits on:",
		"  - OP-29 Create the runtime (done)",
		"    Outcome: The runtime writes one durable row.",
		"  - OP-32 Open the chat (agent review)",
		"  - OP-52 Run late or leave missed (human review)",
		"- Ready: no. OP-32 is not merged, and OP-52 is open.",
		"- Releases:",
		"  - OP-35 Close a stale run",
		"  - OP-40 Start an unattended run",
		"- Applies: OP-52, open. Run late or leave missed",
	]);
});

test("omits Applies when no question holds the ticket back", async () => {
	const lines = await db.transaction((tx) => chainLines(tx, tickets[6] as string));
	expect(lines).toEqual([
		"## Chain",
		"",
		"- Waits on:",
		"  - OP-32 Open the chat (agent review)",
		"- Ready: no. OP-32 is not merged.",
		"- Releases:",
		"  - nothing",
	]);
	expect(lines).not.toContainEqual(expect.stringContaining("Applies"));
});

test("prints all three required lines when the ticket has no edges", async () => {
	expect(await db.transaction((tx) => chainLines(tx, tickets[7] as string))).toEqual([
		"## Chain",
		"",
		"- Waits on:",
		"  - nothing",
		"- Ready: yes. No ticket holds this one back.",
		"- Releases:",
		"  - nothing",
	]);
});
