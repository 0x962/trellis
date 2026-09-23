import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import { candidates } from "./candidates.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const root = ulid();
const startedStatus = ulid();
const humanReviewStatus = ulid();
const at = new Date("2026-09-21T12:00:00.000Z");
const humanReviewTicket = ulid();
const readyPullRequestTicket = ulid();
const githubDraftReadyPullRequestTicket = ulid();
const notReadyPullRequestTicket = ulid();

// Every pull request here holds the explanation of its commit and the
// evidence document, because `reviewGaps` asks for both before the person
// reviews it.
const addPullRequest = async (ticketId: string, number: number, draft: boolean, localState = "ready") => {
	const id = ulid();
	const headSha = `head-${number}`;
	await db.execute(sql`INSERT INTO pull_requests (
		id, owner, repo, number, url, state, is_draft, local_state, head_sha, review_state, checks, ci_state, created_at, updated_at
	) VALUES (
		${id}, 'acme', 'app', ${number}, ${`https://github.com/acme/app/pull/${number}`},
		'open', ${draft}, ${localState}, ${headSha}, 'review_required', '[]', 'pass', ${at}, ${at}
	)`);
	await db.execute(sql`INSERT INTO pr_summaries
		(pull_request_id, head_sha, headline, why, watch, created_at, updated_at)
		VALUES (${id}, ${headSha}, 'It adds the page.', 'The page was missing.', 'nothing', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO pr_evidence_documents
		(pull_request_id, head_sha, body, actor_name, actor_kind, created_at, updated_at)
		VALUES (${id}, ${headSha}, 'Proof.', 'Test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (
		ticket_id, pull_request_id, source, actor_name, actor_kind, created_at
	) VALUES (${ticketId}, ${id}, 'manual', 'Test', 'human', ${at})`);
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('Test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${root}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at
	) VALUES
		(${startedStatus}, ${root}, 'In Progress', 'in-progress', 'started', NULL, 'fg-muted', 0, true, ${at}, ${at}),
		(${humanReviewStatus}, ${root}, 'Human Review', 'human-review', 'review', 'human', 'fg-muted', 1, false, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, number, title, status_id, position, created_at, updated_at
	) VALUES
		(${humanReviewTicket}, ${root}, 1, 'Answer the question', ${humanReviewStatus}, 0, ${at}, ${at}),
		(${readyPullRequestTicket}, ${root}, 2, 'Review the pull request', ${startedStatus}, 1, ${at}, ${at}),
		(${githubDraftReadyPullRequestTicket}, ${root}, 3, 'Review the GitHub draft', ${startedStatus}, 2, ${at}, ${at}),
		(${notReadyPullRequestTicket}, ${root}, 4, 'Ask for review', ${startedStatus}, 3, ${at}, ${at})`);
	await addPullRequest(readyPullRequestTicket, 2, false);
	await addPullRequest(githubDraftReadyPullRequestTicket, 3, true);
	await addPullRequest(notReadyPullRequestTicket, 4, true, "not-ready");
});

afterAll(async () => {
	await db.$client.close();
});

test("lists every ticket whose turn is the person", async () => {
	const found = await db.transaction((tx) => candidates(tx, "Test"));

	expect(
		found
			.filter((item) => item.section === "review")
			.map((item) => item.identifier)
			.sort(),
	).toEqual(["TST-1", "TST-2", "TST-3"]);
});

test("applies working-run precedence from turnOf", async () => {
	const found = await db.transaction((tx) =>
		candidates(tx, "Test", new Set([humanReviewTicket, readyPullRequestTicket])),
	);

	expect(
		found
			.filter((item) => item.section === "review")
			.map((item) => item.identifier)
			.sort(),
	).toEqual(["TST-1", "TST-3"]);
});
