import { afterAll, beforeAll, expect, test } from "bun:test";
import { TicketSummarySchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { ticketSummary } from "./queries/ticketGet.ts";
import { openTestDb } from "./testDb.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const root = ulid();
const epic = ulid();
const todoStatus = ulid();
const startedStatus = ulid();
const questionStatus = ulid();
const doneStatus = ulid();
const canceledStatus = ulid();
const at = new Date("2026-09-20T10:00:00.000Z");
const tickets = Array.from({ length: 11 }, () => ulid());

const insertPullRequest = async (ticketId: string, number: number, headRef: string, baseRef: string) => {
	const id = ulid();
	await db.execute(sql`INSERT INTO pull_requests (
		id, owner, repo, number, url, state, is_draft, head_ref, base_ref,
		review_state, checks, ci_state, created_at, updated_at
	) VALUES (
		${id}, 'acme', 'app', ${number}, ${`https://github.com/acme/app/pull/${number}`},
		'open', false, ${headRef}, ${baseRef}, 'none', '[]'::jsonb, 'none', ${at}, ${at}
	)`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (
		ticket_id, pull_request_id, source, actor_name, actor_kind, created_at
	) VALUES (${ticketId}, ${id}, 'manual', 'Test', 'human', ${at})`);
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('Test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${root}, ${root}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at
	) VALUES
		(${todoStatus}, ${root}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true, ${at}, ${at}),
		(${startedStatus}, ${root}, 'In Progress', 'in-progress', 'started', NULL, 'accent', 1, false, ${at}, ${at}),
		(${questionStatus}, ${root}, 'Human Review', 'human-review', 'review', 'human', 'warning', 2, false, ${at}, ${at}),
		(${doneStatus}, ${root}, 'Done', 'done', 'done', NULL, 'success', 3, false, ${at}, ${at}),
		(${canceledStatus}, ${root}, 'Canceled', 'canceled', 'canceled', NULL, 'fg-muted', 4, false, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO epics (
		id, project_id, root_id, slug, name, description, actor_name, actor_kind, created_at, updated_at
	) VALUES (${epic}, ${root}, ${root}, 'plan', 'Plan', '', 'Test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, root_id, number, title, description, status_id, epic_id, position, created_at, updated_at
	) VALUES
		(${tickets[0]}, ${root}, ${root}, 1, 'Done blocker', '', ${doneStatus}, ${epic}, 0, ${at}, ${at}),
		(${tickets[1]}, ${root}, ${root}, 2, 'Open question', E'The run needs a bound.\\n\\nOptions:\\n\\n1. Yes\\n2. No', ${questionStatus}, ${epic}, 1, ${at}, ${at}),
		(${tickets[2]}, ${root}, ${root}, 3, 'Human review without options', '', ${questionStatus}, ${epic}, 2, ${at}, ${at}),
		(${tickets[3]}, ${root}, ${root}, 4, 'Subject', '', ${todoStatus}, ${epic}, 3, ${at}, ${at}),
		(${tickets[4]}, ${root}, ${root}, 5, 'Released ticket', '', ${todoStatus}, ${epic}, 4, ${at}, ${at}),
		(${tickets[5]}, ${root}, ${root}, 6, 'Indirect ticket', '', ${todoStatus}, ${epic}, 5, ${at}, ${at}),
		(${tickets[6]}, ${root}, ${root}, 7, 'Ready ticket', '', ${todoStatus}, ${epic}, 6, ${at}, ${at}),
		(${tickets[7]}, ${root}, ${root}, 8, 'Ready without dependencies', '', ${todoStatus}, ${epic}, 7, ${at}, ${at}),
		(${tickets[8]}, ${root}, ${root}, 9, 'Started without dependencies', '', ${startedStatus}, ${epic}, 8, ${at}, ${at}),
		(${tickets[9]}, ${root}, ${root}, 10, 'Outside the epic', '', ${todoStatus}, NULL, 9, ${at}, ${at}),
		(${tickets[10]}, ${root}, ${root}, 11, 'Canceled blocker', '', ${canceledStatus}, ${epic}, 10, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at) VALUES
		(${tickets[1]}, ${tickets[8]}, 'manual', ${at}),
		(${tickets[3]}, ${tickets[0]}, 'manual', ${at}),
		(${tickets[3]}, ${tickets[1]}, 'manual', ${at}),
		(${tickets[3]}, ${tickets[2]}, 'manual', ${at}),
		(${tickets[4]}, ${tickets[3]}, 'manual', ${at}),
		(${tickets[5]}, ${tickets[4]}, 'manual', ${at}),
		(${tickets[6]}, ${tickets[0]}, 'manual', ${at}),
		(${tickets[6]}, ${tickets[10]}, 'manual', ${at})`);
	await insertPullRequest(tickets[0] as string, 10, "feature/base", "main");
	await insertPullRequest(tickets[3] as string, 11, "feature/subject", "feature/base");
	await insertPullRequest(tickets[9] as string, 12, "feature/outside", "feature/base");
});

afterAll(async () => {
	await db.$client.close();
});

test("a ticket summary carries direct waits, releases, and readiness", async () => {
	const summary = await db.transaction((tx) => ticketSummary(tx, tickets[3] as string));
	expect(TicketSummarySchema.parse(summary)).toEqual(summary);
	expect(summary.waitsOn).toEqual([
		{ identifier: "TST-2", title: "Open question", status: "review", isQuestion: true },
		{ identifier: "TST-3", title: "Human review without options", status: "review", isQuestion: false },
	]);
	expect(summary.releases).toEqual([{ identifier: "TST-5", title: "Released ticket" }]);
	expect(summary.ready).toBe(false);
	expect(summary.waitsOn).not.toContainEqual(expect.objectContaining({ identifier: "TST-9" }));
	expect(summary.prRows[0]?.stackedOn).toEqual({
		number: 10,
		headRef: "feature/base",
		ticketIdentifier: "TST-1",
	});
});

test("ready requires todo and no unfinished direct dependency", async () => {
	const ready = await db.transaction((tx) => ticketSummary(tx, tickets[6] as string));
	const empty = await db.transaction((tx) => ticketSummary(tx, tickets[7] as string));
	const started = await db.transaction((tx) => ticketSummary(tx, tickets[8] as string));
	expect(ready).toMatchObject({ waitsOn: [], ready: true });
	expect(empty).toMatchObject({ waitsOn: [], ready: true });
	expect(started.ready).toBe(false);
});

test("a matching base ref outside the epic is not a stack", async () => {
	const outside = await db.transaction((tx) => ticketSummary(tx, tickets[9] as string));
	expect(outside.prRows[0]?.stackedOn).toBeNull();
});
