import { afterAll, beforeAll, expect, test } from "bun:test";
import { askedForReview, type ChangedFile, TicketSummarySchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "./client.ts";
import { ticketSummary } from "./queries/ticketGet.ts";
import { openTestDb } from "./testDb.ts";

let db: Db;
const root = ulid();
const status = ulid();
const ticket = ulid();
const emptyTicket = ulid();
const deletedTestTicket = ulid();
const at = new Date("2026-09-20T10:00:00.000Z");
const repoWithTrellisPathRules = "trellis";

const check = (name: string, workflow: string | null, bucket: string) => ({ name, workflow, bucket, link: null });

const insertPull = async ({
	number,
	additions,
	deletions,
	checks,
	files,
	changedFiles = files?.length ?? null,
	ticketId = ticket,
	headSha = null,
	isQueued = false,
}: {
	number: number;
	additions: number | null;
	deletions: number | null;
	checks: ReturnType<typeof check>[];
	files: ChangedFile[] | null;
	changedFiles?: number | null;
	ticketId?: string;
	headSha?: string | null;
	isQueued?: boolean;
}) => {
	const id = ulid();
	await db.execute(sql`INSERT INTO pull_requests (
		id, owner, repo, number, additions, deletions, changed_files, files, url, state, is_draft, is_queued, head_sha,
		head_ref, base_ref, review_state, checks, ci_state, created_at, updated_at
	) VALUES (
		${id}, 'acme', ${repoWithTrellisPathRules}, ${number}, ${additions}, ${deletions}, ${changedFiles},
		${files === null ? null : JSON.stringify(files)}::jsonb,
		${`https://github.com/acme/${repoWithTrellisPathRules}/pull/${number}`}, 'open', ${number === 2}, ${isQueued}, ${headSha},
		${`feature-${number}`}, 'main', 'review_required', ${JSON.stringify(checks)}::jsonb,
		'fail', ${at}, ${at}
	)`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (
		ticket_id, pull_request_id, source, actor_name, actor_kind, created_at
	) VALUES (${ticketId}, ${id}, 'manual', 'Test', 'human', ${new Date(at.getTime() + number)})`);
	return id;
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('Test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${root}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, color, position, is_default, created_at, updated_at
	) VALUES (${status}, ${root}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, number, title, status_id, position, created_at, updated_at
	) VALUES
		(${ticket}, ${root}, 1, 'Task', ${status}, 0, ${at}, ${at}),
		(${emptyTicket}, ${root}, 2, 'Empty task', ${status}, 1, ${at}, ${at}),
		(${deletedTestTicket}, ${root}, 4, 'Deleted test task', ${status}, 3, ${at}, ${at})`);

	const first = await insertPull({
		number: 1,
		additions: 99,
		deletions: 100,
		checks: [
			check("unit", "CI", "pass"),
			check("lint", "CI", "fail"),
			check("old job", null, "cancel"),
			check("deploy", "Release", "pending"),
			check("docs", "CI", "skipping"),
		],
		files: [
			{ path: "apps/web/src/routes/index.tsx", change: "change", additions: 20, deletions: 2 },
			{ path: "apps/server/src/auth/session.ts", change: "change", additions: 20, deletions: 2 },
			{ path: "apps/server/drizzle/0087_kind.sql", change: "change", additions: 20, deletions: 2 },
			{ path: "package.json", change: "change", additions: 1, deletions: 1 },
			{ path: "packages/api/src/schemas/review.ts", change: "change", additions: 10, deletions: 1 },
		],
		isQueued: true,
	});
	await db.execute(sql`INSERT INTO review_submissions (id, pr_id, request_id, actor, document, created_at)
		VALUES
			(${ulid()}, ${first}, ${crypto.randomUUID()}, 'Test', ${{ verdict: "approved" }}, ${at}),
			(${ulid()}, ${first}, ${crypto.randomUUID()}, 'Test', ${{ verdict: "changes_requested" }},
				${new Date(at.getTime() + 1)})`);
	await insertPull({
		number: 2,
		additions: 200,
		deletions: 200,
		checks: [],
		files: [{ path: "apps/server/src/log.ts", change: "change", additions: 5, deletions: 1 }],
	});
	await insertPull({
		number: 3,
		additions: 401,
		deletions: 0,
		checks: [],
		files: [{ path: "packages/ui/src/Button.tsx", change: "change", additions: 5, deletions: 1 }],
	});
	await insertPull({ number: 4, additions: null, deletions: null, checks: [], files: null });
	await insertPull({
		number: 5,
		additions: 1,
		deletions: 1,
		checks: [],
		files: [{ path: "packages/ui/src/Dialog.tsx", change: "change", additions: 1, deletions: 1 }],
		changedFiles: 2,
	});
	const reviewerRunId = ulid();
	await db.execute(sql`INSERT INTO review_threads (id, pr_id, document, updated_at) VALUES
		(${ulid()}, ${first}, ${{ status: "open", author: "Code Reviewer", session: "review-session" }}, ${at}),
		(${ulid()}, ${first}, ${{ status: "resolved" }}, ${at})`);
	let newestExecution = "";
	for (const [index, state] of [
		"running",
		"succeeded",
		"failed",
		"canceled",
		"waiting",
		"running",
		"failed",
	].entries()) {
		const execution = ulid();
		newestExecution = execution;
		await db.execute(sql`INSERT INTO flow_executions (
			id, flow_id, ticket_id, project_id, actor_kind, actor_name, request_id,
			request, doc, state, revision, created_at, updated_at
		) VALUES (
			${execution}, ${ulid()}, ${ticket}, ${root}, 'human', 'Test', ${crypto.randomUUID()},
			'{}', ${{ flow: { name: `Code Reviewer ${index + 1}` } }}, ${{ status: state }}, 1,
			${new Date(at.getTime() + index)}, ${at}
		)`);
	}
	const reviewerAttemptId = ulid();
	await db.execute(sql`INSERT INTO agent_runs (
		id, name, kind, instruction, project_id, project_key, ticket_id, ticket_identifier,
		session_id, created_at, updated_at
	) VALUES (
		${reviewerRunId}, 'Code Reviewer', 'flow', 'Review the pull request.', ${root}, '/tmp/test', ${ticket},
		'TST-1', 'review-session', ${at}, ${at}
	)`);
	await db.execute(sql`INSERT INTO agent_execution_attempts (id, run_id, generation, token_hash, created_at)
		VALUES (${reviewerAttemptId}, ${reviewerRunId}, 1, 'hash', ${at})`);
	await db.execute(sql`INSERT INTO flow_execution_tasks (execution_id, key, run_id, attempt_id, created_at)
		VALUES (${newestExecution}, 'review', ${reviewerRunId}, ${reviewerAttemptId}, ${at})`);
	const deletedTestPullRequest = await insertPull({
		number: 7,
		additions: 20,
		deletions: 10,
		checks: [],
		files: [
			{ path: "apps/web/src/App.tsx", change: "change", additions: 20, deletions: 0 },
			{ path: "apps/web/src/App.test.tsx", change: "change", additions: 0, deletions: 10 },
		],
		ticketId: deletedTestTicket,
		headSha: "deleted-test-head",
	});
	await db.execute(sql`INSERT INTO pr_summaries (
		pull_request_id, head_sha, headline, why, watch, created_at, updated_at
	) VALUES (
		${deletedTestPullRequest}, 'deleted-test-head', 'Remove one test.',
		'The row uses the stored file counts.', 'nothing', ${at}, ${at}
	)`);
});

afterAll(async () => {
	await db.$client.close();
});

test("a ticket summary carries one row for each pull request", async () => {
	const summary = await db.transaction((tx) => ticketSummary(tx, ticket));
	expect(TicketSummarySchema.parse(summary)).toEqual(summary);
	expect(summary.prRows.map((row) => row.sizeBand)).toEqual(["small", "medium", "large", null, "small"]);
	expect(summary.pr?.isQueued).toBe(true);
	expect(summary.prRows.map((row) => row.isQueued)).toEqual([true, false, false, false, false]);
	expect(summary.prRows[0]).toMatchObject({
		pass: 1,
		fail: 2,
		pending: 1,
		skipped: 1,
		failedChecks: [
			{ name: "lint", workflow: "CI" },
			{ name: "old job", workflow: null },
		],
		openThreads: 1,
		flowRuns: [
			{ name: "Code Reviewer 7", status: "failed", findings: 1 },
			{ name: "Code Reviewer 6", status: "running", findings: 0 },
			{ name: "Code Reviewer 5", status: "waiting", findings: 0 },
			{ name: "Code Reviewer 4", status: "canceled", findings: 0 },
			{ name: "Code Reviewer 3", status: "failed", findings: 0 },
		],
		baseRef: "main",
		headRef: "feature-1",
	});
	expect(summary.prRows[0]).not.toHaveProperty("files");
	expect(summary.prRows.every((row) => row.flowRuns.length === 5)).toBe(true);
	expect(summary.pr?.reviews[0]?.reviewState).toBe("changes_requested");
	expect(summary.pr?.reviews[1]?.reviewState).toBe("none");

	const emptySummary = await db.transaction((tx) => ticketSummary(tx, emptyTicket));
	expect(TicketSummarySchema.parse(emptySummary)).toEqual(emptySummary);
	expect(emptySummary.prRows).toEqual([]);
});

test("the row verdict is the newest verdict of the person", async () => {
	const [row] = (
		await db.execute(sql`SELECT pull_request_id AS id FROM ticket_pull_requests WHERE ticket_id = ${deletedTestTicket}`)
	).rows as { id: string }[];
	const revision = ulid();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('crisp-fjord', 'agent', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO review_revisions (id, pr_id, base_sha, head_sha, document, created_at)
		VALUES (${revision}, ${row!.id}, 'base', 'deleted-test-head', '{}', ${at})`);
	const submit = (actor: string, verdict: string, minutes: number) => {
		const createdAt = new Date(at.getTime() + minutes * 60_000);
		return db.execute(sql`INSERT INTO review_submissions (id, pr_id, request_id, actor, document, created_at)
			VALUES (${ulid()}, ${row!.id}, ${crypto.randomUUID()}, ${actor},
				${{ verdict, revisionId: revision, createdAt: createdAt.toISOString() }}, ${createdAt})`);
	};
	await submit("Test", "changes_requested", 1);
	await submit("Test", "approved", 2);
	await submit("Test", "commented", 3);
	await submit("crisp-fjord", "changes_requested", 4);

	const summary = await db.transaction((tx) => ticketSummary(tx, deletedTestTicket));
	expect(summary.prRows[0]?.verdict).toBe("approved");

	await db.execute(sql`UPDATE pull_requests SET head_sha = 'pushed-head' WHERE id = ${row!.id}`);
	const afterPush = await db.transaction((tx) => ticketSummary(tx, deletedTestTicket));
	expect(afterPush.prRows[0]?.verdict).toBe("approved");
	await db.execute(sql`UPDATE pull_requests SET head_sha = 'deleted-test-head' WHERE id = ${row!.id}`);
});

// The one badge of a ticket row draws the review flag of every pull request
// the ticket links. A check that starts or finishes must not move it.
test("the query keeps the not-asked gap of the ticket while one pull request waits for its agent", async () => {
	const twoPullTicket = ulid();
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, number, title, status_id, position, created_at, updated_at
	) VALUES (${twoPullTicket}, ${root}, 5, 'Two pull requests', ${status}, 4, ${at}, ${at})`);
	const handedOver = await insertPull({
		number: 11,
		additions: 10,
		deletions: 1,
		checks: [check("unit", "CI", "fail")],
		files: [{ path: "apps/server/src/log.ts", change: "change", additions: 5, deletions: 1 }],
		ticketId: twoPullTicket,
	});
	const heldBack = await insertPull({
		number: 12,
		additions: 4,
		deletions: 0,
		checks: [check("unit", "CI", "pass")],
		files: [{ path: "packages/ui/src/Button.tsx", change: "change", additions: 4, deletions: 0 }],
		ticketId: twoPullTicket,
	});
	await db.execute(sql`UPDATE pull_requests SET local_state = 'not-ready' WHERE id = ${heldBack}`);

	const withTheFailedCheck = await db.transaction((tx) => ticketSummary(tx, twoPullTicket));
	expect(withTheFailedCheck.pr).not.toBeNull();
	expect(askedForReview(withTheFailedCheck.pr!)).toBe(false);

	await db.execute(sql`UPDATE pull_requests
		SET checks = ${JSON.stringify([check("unit", "CI", "pass")])}::jsonb, ci_state = 'pass'
		WHERE id = ${handedOver}`);

	const afterTheCheckPasses = await db.transaction((tx) => ticketSummary(tx, twoPullTicket));
	expect(askedForReview(afterTheCheckPasses.pr!)).toBe(false);
});
