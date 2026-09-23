import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../testDb.ts";
import { openFlowRuns, stuckReviewMessages } from "./statisticsFaults.ts";
import { loopBill, loopTotals } from "./statisticsLoop.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const root = ulid();
const status = ulid();
const at = new Date("2026-09-20T12:00:00.000Z");
// One ticket per fault, and two tickets that carry the merged pull
// requests of block two.
const heldTicket = ulid();
const failedTicket = ulid();
const waitingTicket = ulid();
const runningTicket = ulid();
const readTicket = ulid();
const quietTicket = ulid();
const readPr = ulid();
const quietPr = ulid();

const addDelivery = async (state: string, ticketId: string | null, dueAt: string) =>
	db.execute(sql`INSERT INTO review_deliveries (id, thread_message_id, ticket_id, state, due_at)
		VALUES (${ulid()}, ${ulid()}, ${ticketId}, ${state}, ${new Date(dueAt)})`);

const addFlowRun = async (ticketId: string, status: string, updatedAt: string) =>
	db.execute(sql`INSERT INTO flow_executions (
		id, flow_id, ticket_id, project_id, actor_kind, actor_name, request_id, request, doc, state, revision,
		created_at, updated_at
	) VALUES (
		${ulid()}, ${ulid()}, ${ticketId}, ${root}, 'agent', 'Scout', ${ulid()}, '{}', '{}',
		${JSON.stringify({ status })}, 1, ${at}, ${new Date(updatedAt)}
	)`);

const addPullRequest = async (
	id: string,
	ticketId: string,
	number: number,
	mergedAt: string,
	readyAt: string | null = null,
) => {
	await db.execute(sql`INSERT INTO pull_requests (
		id, owner, repo, number, url, title, state, local_state, review_state, checks, ci_state,
		merged_at, ready_for_review_at, created_at, updated_at
	) VALUES (
		${id}, 'acme', 'app', ${number}, ${`https://github.com/acme/app/pull/${number}`},
		${`Change ${number}`}, 'merged', 'ready', 'approved', '[]', 'pass', ${new Date(mergedAt)},
		${readyAt === null ? null : new Date(readyAt)}, ${at}, ${at}
	)`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (
		ticket_id, pull_request_id, source, actor_name, actor_kind, created_at
	) VALUES (${ticketId}, ${id}, 'manual', 'Navid', 'human', ${at})`);
};

const addThread = async (prId: string, kind: string) =>
	db.execute(sql`INSERT INTO review_threads (id, pr_id, document, updated_at)
		VALUES (${ulid()}, ${prId}, ${JSON.stringify({ kind })}::jsonb, ${at})`);

const addSubmission = async (prId: string, actor: string, verdict: string, createdAt = at.toISOString()) =>
	db.execute(sql`INSERT INTO review_submissions (id, pr_id, request_id, actor, document, created_at)
		VALUES (${ulid()}, ${prId}, ${ulid()}, ${actor}, ${JSON.stringify({ verdict })}::jsonb, ${new Date(createdAt)})`);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('Navid', 'human', ${at}, ${at}), ('Scout', 'agent', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${root}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at
	) VALUES (${status}, ${root}, 'In Progress', 'in-progress', 'started', NULL, 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, number, title, status_id, position, created_at, updated_at
	) VALUES
		(${heldTicket}, ${root}, 1, 'Held message', ${status}, 0, ${at}, ${at}),
		(${failedTicket}, ${root}, 2, 'Failed message', ${status}, 1, ${at}, ${at}),
		(${waitingTicket}, ${root}, 3, 'Waiting flow', ${status}, 2, ${at}, ${at}),
		(${runningTicket}, ${root}, 4, 'Running flow', ${status}, 3, ${at}, ${at}),
		(${readTicket}, ${root}, 5, 'The change he read', ${status}, 4, ${at}, ${at}),
		(${quietTicket}, ${root}, 6, 'The change he did not read', ${status}, 5, ${at}, ${at})`);

	await addDelivery("held", heldTicket, "2026-09-19T12:00:00.000Z");
	await addDelivery("held", heldTicket, "2026-09-19T18:00:00.000Z");
	await addDelivery("failed", failedTicket, "2026-09-18T12:00:00.000Z");
	// Migration 0101 left a failed message that names no ticket.
	await addDelivery("failed", null, "2026-09-17T12:00:00.000Z");
	await addDelivery("sent", heldTicket, "2026-09-16T12:00:00.000Z");

	await addFlowRun(waitingTicket, "waiting", "2026-09-19T06:00:00.000Z");
	await addFlowRun(runningTicket, "running", "2026-09-18T06:00:00.000Z");
	await addFlowRun(runningTicket, "running", "2026-09-19T06:00:00.000Z");
	await addFlowRun(waitingTicket, "succeeded", "2026-09-15T06:00:00.000Z");

	// The read pull request became ready two hours before the first verdict
	// of the person. The quiet one carries no stamp.
	await addPullRequest(readPr, readTicket, 11, "2026-09-19T09:00:00.000Z", "2026-09-19T06:00:00.000Z");
	await addPullRequest(quietPr, quietTicket, 12, "2026-09-20T09:00:00.000Z");
	await addThread(readPr, "human");
	await addThread(readPr, "human");
	await addThread(readPr, "agent");
	await addThread(quietPr, "agent");
	await addSubmission(readPr, "Navid", "changes_requested", "2026-09-19T08:00:00.000Z");
	await addSubmission(readPr, "Navid", "approved", "2026-09-19T08:30:00.000Z");
	// An agent submits a review from the CLI. Block two counts no agent
	// verdict.
	await addSubmission(quietPr, "Scout", "changes_requested");
});

afterAll(async () => {
	await db.$client.close();
});

test("groups the stuck review messages by state, oldest first", async () => {
	const found = await db.transaction((tx) => stuckReviewMessages(tx));

	expect(found).toEqual([
		{ key: "failed", count: 2, identifier: null, title: null, since: "2026-09-17T12:00:00.000Z" },
		{ key: "held", count: 2, identifier: "TST-1", title: "Held message", since: "2026-09-19T12:00:00.000Z" },
	]);
});

test("groups the open flow runs by status and counts no run that ended", async () => {
	const found = await db.transaction((tx) => openFlowRuns(tx));

	expect(found).toEqual([
		{ key: "running", count: 2, identifier: "TST-4", title: "Running flow", since: "2026-09-18T06:00:00.000Z" },
		{ key: "waiting", count: 1, identifier: "TST-3", title: "Waiting flow", since: "2026-09-19T06:00:00.000Z" },
	]);
});

test("counts the loop over the window of merged pull requests", async () => {
	const totals = await db.transaction((tx) => loopTotals(tx, 30));

	expect(totals).toEqual({
		merged: 2,
		oldestMergedAt: "2026-09-19T09:00:00.000Z",
		sentBack: 1,
		withPersonVerdict: 1,
		threadsByPerson: 2,
		threadsByAgent: 2,
		readyToVerdictMs: 2 * 60 * 60 * 1000,
		readyToVerdictMeasured: 1,
	});
});

test("holds the window to the newest merged pull requests", async () => {
	const totals = await db.transaction((tx) => loopTotals(tx, 1));

	expect(totals.merged).toBe(1);
	expect(totals.oldestMergedAt).toBe("2026-09-20T09:00:00.000Z");
	expect(totals.threadsByPerson).toBe(0);
});

test("measures the wait from ready to a verdict over the rows that carry both", async () => {
	// The newest merged pull request carries no ready stamp, so the window of
	// one holds nothing to measure.
	const totals = await db.transaction((tx) => loopTotals(tx, 1));

	expect(totals.readyToVerdictMs).toBeNull();
	expect(totals.readyToVerdictMeasured).toBe(0);
});

test("names the pull requests that took the threads of a person", async () => {
	const bill = await db.transaction((tx) => loopBill(tx, 30, 5));

	expect(bill).toEqual([
		{
			prId: readPr,
			ticket: "TST-5",
			title: "Change 11",
			url: "https://github.com/acme/app/pull/11",
			threadsByPerson: 2,
			sentBack: 1,
			mergedAt: "2026-09-19T09:00:00.000Z",
		},
	]);
});
