import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { iso } from "../db/queries/support.ts";
import { ticketSummaries } from "../db/queries/ticketSummaries.ts";
import { openTestDb } from "../db/testDb.ts";
import type { Tx } from "../db/tx.ts";
import type { PullRequestRow } from "../gh/graphql.ts";
import { upsertPullRequests } from "../gh/pollerWrite.ts";
import { candidates } from "./needsYou/candidates.ts";
import { setLocalState } from "./pullRequestLocalState.ts";
import { link, setHeadSha } from "./pullRequests.ts";
import type { ServiceCtx } from "./support.ts";

// One database for the file, because a fresh one runs every migration and
// that costs seconds. Each test takes its own ticket and its own pull
// request number, so no test reads a row another test wrote.
let db: Awaited<ReturnType<typeof openTestDb>>;
let events: { type: string }[] = [];
let status: string;
let ticketNumber = 0;

const root = ulid();
const at = new Date("2026-09-22T10:00:00.000Z");
const later = new Date("2026-09-22T16:00:00.000Z");
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

// The fields of the service context that `link` and `setLocalState` read.
const ctxOf = (actor: ActorRef, now: Date = at) =>
	({
		actor,
		now: () => now,
		emit: (event: { type: string }) => {
			events.push(event);
		},
	}) as unknown as ServiceCtx;

const newTicket = async (title: string) => {
	ticketNumber += 1;
	const id = ulid();
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, root_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${id}, ${root}, ${root}, ${ticketNumber}, ${title}, ${status}, ${ticketNumber}, ${at}, ${at})`);
	return { id, identifier: `LOC-${ticketNumber}` };
};

beforeAll(async () => {
	db = await openTestDb();
	status = ulid();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${root}, 'LOC', 'loc', 'Local', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES (${status}, ${root}, 'In Progress', 'in-progress', 'started', NULL, 'accent', 0, true, ${at}, ${at})`);
}, 60_000);

beforeEach(() => {
	events = [];
});

afterAll(async () => {
	await db.$client.close();
});

// gh answers with an error, so the link stores the pull request without a
// gh process, the way it does while gh is away.
const linkAs = (actor: ActorRef, ticket: string, number: number) =>
	run((tx) =>
		link(ctxOf(actor), tx, {
			ticket,
			url: `https://github.com/acme/app/pull/${number}`,
			ref: { owner: "acme", repo: "app", number },
			fetched: { error: "gh is away" },
		}),
	);

const agent: ActorRef = { kind: "agent", name: "claude-code" };
const person: ActorRef = { kind: "human", name: "dana" };

// The commit the pull request points at, and the parts the agent writes for
// that commit. `reviewGaps` reads all of them, so a test takes one away to
// see the pull request go back to not ready for review.
const writeParts = async (id: string, headSha: string) => {
	await db.execute(sql`UPDATE pull_requests SET head_sha = ${headSha}, ci_state = 'pass' WHERE id = ${id}`);
	await db.execute(sql`INSERT INTO pr_summaries (pull_request_id, head_sha, headline, why, watch, created_at, updated_at)
		VALUES (${id}, ${headSha}, 'It adds the rule.', 'The glyph lied.', 'nothing', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO pr_evidence_documents
		(pull_request_id, head_sha, body, actor_name, actor_kind, created_at, updated_at)
		VALUES (${id}, ${headSha}, 'Proof.', 'claude-code', 'agent', ${at}, ${at})`);
};

// One ticket, its pull request, and the parts of the commit `head`, with the
// agent asking for review. Every test that watches a ready pull request go
// back starts here.
const readyPullRequest = async (title: string, number: number) => {
	const ticket = await newTicket(title);
	const linked = await linkAs(agent, ticket.identifier, number);
	await writeParts(linked.id, `head${number}`);
	await run((tx) => setLocalState(ctxOf(agent), tx, { id: linked.id, localState: "ready" }));
	return { ticket, id: linked.id };
};

const gapsOf = async (ticketId: string) => {
	const [ticket] = await run((tx) => ticketSummaries(tx, [ticketId]));
	return ticket!.prRows[0]!.reviewGaps.map((gap) => gap.kind);
};

const inboxOf = async () => (await run((tx) => candidates(tx, "dana"))).map((item) => item.identifier);

const activityOf = async (id: string) => {
	const found = await db.execute(
		sql`SELECT action, actor_name, actor_kind FROM activity
			WHERE action LIKE 'pr.%ready_for_review' AND meta->>'pullRequestId' = ${id} ORDER BY id`,
	);
	return (found.rows as { action: string; actor_name: string; actor_kind: string }[]).map((row) => [
		row.action,
		row.actor_kind,
		row.actor_name,
	]);
};

// The driver answers a timestamp column as the text Postgres prints, so the
// test reads it as an ISO string and compares it to one.
const readyAtOf = async (id: string) => {
	const found = await db.execute(
		sql`SELECT ${iso(sql`ready_for_review_at`)} AS at FROM pull_requests WHERE id = ${id}`,
	);
	return (found.rows[0] as { at: string | null }).at;
};

test("a pull request that an agent links waits for the agent to ask for review", async () => {
	const ticket = await newTicket("Link as an agent");

	const linked = await linkAs(agent, ticket.identifier, 101);

	expect(linked.localState).toBe("not-ready");
	expect(linked.reviewGaps).toContainEqual({ kind: "not-asked", count: 1 });
});

test("a pull request that a person links starts as ready", async () => {
	const ticket = await newTicket("Link as a person");

	const linked = await linkAs(person, ticket.identifier, 102);

	expect(linked.localState).toBe("ready");
});

test("a second link of the same pull request keeps the state that trellis ready set", async () => {
	const ticket = await newTicket("Link the same one twice");
	const linked = await linkAs(agent, ticket.identifier, 103);
	await run((tx) => setLocalState(ctxOf(agent), tx, { id: linked.id, localState: "ready" }));

	const again = await linkAs(agent, ticket.identifier, 103);

	expect(again.localState).toBe("ready");
});

test("setLocalState writes the state, announces the update and changes the turn", async () => {
	const ticket = await newTicket("Ask for review");
	const linked = await linkAs(agent, ticket.identifier, 104);
	await writeParts(linked.id, "head104");
	const beforeGaps = await gapsOf(ticket.id);
	const beforeInbox = await inboxOf();
	events = [];

	const ready = await run((tx) => setLocalState(ctxOf(agent), tx, { id: linked.id, localState: "ready" }));

	expect(beforeGaps).toEqual(["not-asked"]);
	expect(beforeInbox).not.toContain(ticket.identifier);
	expect(ready.localState).toBe("ready");
	expect(events.map((event) => event.type)).toEqual(["pr.updated"]);
	expect(await gapsOf(ticket.id)).toEqual([]);
	expect(await inboxOf()).toContain(ticket.identifier);
});

test("the ask stamps the moment the wait started and writes the timeline row", async () => {
	const ticket = await newTicket("Stamp the wait");
	const linked = await linkAs(agent, ticket.identifier, 111);
	await writeParts(linked.id, "head111");

	const ready = await run((tx) => setLocalState(ctxOf(agent), tx, { id: linked.id, localState: "ready" }));
	const stamped = await readyAtOf(linked.id);
	const asked = await activityOf(linked.id);

	await run((tx) => setLocalState(ctxOf(person), tx, { id: linked.id, localState: "not-ready" }));

	expect(ready.readyForReviewAt).toBe(at.toISOString());
	expect(stamped).toBe(at.toISOString());
	expect(asked).toEqual([["pr.ready_for_review", "agent", "claude-code"]]);
	expect(await readyAtOf(linked.id)).toBeNull();
	expect(await activityOf(linked.id)).toEqual([
		["pr.ready_for_review", "agent", "claude-code"],
		["pr.not_ready_for_review", "human", "dana"],
	]);
});

// A push means the explanation of the new commit is missing, so the person
// waits for nothing and the stored moment would measure a wait that ended.
test("a new head commit clears the moment the wait started", async () => {
	const { id } = await readyPullRequest("Push after the ask", 112);

	await run((tx) => setHeadSha(tx, { id, headSha: "pushed" }));

	expect(await readyAtOf(id)).toBeNull();
});

test("setLocalState to the stored state writes nothing once the moment stands", async () => {
	const ticket = await newTicket("Ask twice");
	const linked = await linkAs(person, ticket.identifier, 105);
	await run((tx) => setLocalState(ctxOf(person), tx, { id: linked.id, localState: "ready" }));
	events = [];

	const same = await run((tx) => setLocalState(ctxOf(person, later), tx, { id: linked.id, localState: "ready" }));

	expect(same.localState).toBe("ready");
	expect(same.readyForReviewAt).toBe(at.toISOString());
	expect(events).toEqual([]);
});

test("a failed check takes a ready pull request back, and a pass brings it again", async () => {
	const { ticket, id } = await readyPullRequest("Watch the checks", 106);

	await db.execute(sql`UPDATE pull_requests SET ci_state = 'fail',
		checks = '[{"name":"test","workflow":"ci","bucket":"fail","link":null}]'::jsonb WHERE id = ${id}`);
	const failed = await gapsOf(ticket.id);

	await db.execute(sql`UPDATE pull_requests SET ci_state = 'pass',
		checks = '[{"name":"test","workflow":"ci","bucket":"pass","link":null}]'::jsonb WHERE id = ${id}`);

	expect(failed).toEqual(["checks-failed"]);
	expect(await gapsOf(ticket.id)).toEqual([]);
	expect(await inboxOf()).toContain(ticket.identifier);
});

test("a new commit takes the explanation away until the agent writes it again", async () => {
	const { ticket, id } = await readyPullRequest("Write the explanation again", 107);

	await db.execute(sql`UPDATE pull_requests SET head_sha = 'newsha' WHERE id = ${id}`);
	const pushed = await gapsOf(ticket.id);

	await db.execute(sql`INSERT INTO pr_summaries (pull_request_id, head_sha, headline, why, watch, created_at, updated_at)
		VALUES (${id}, 'newsha', 'It adds the rule.', 'The glyph lied.', 'nothing', ${at}, ${at})`);

	expect(pushed).toEqual(["explanation"]);
	expect(await gapsOf(ticket.id)).toEqual([]);
});

test("an open finding takes a ready pull request back until somebody resolves it", async () => {
	const { ticket, id } = await readyPullRequest("Resolve the finding", 108);
	const thread = ulid();

	await db.execute(sql`INSERT INTO review_threads (id, pr_id, document, updated_at)
		VALUES (${thread}, ${id}, '{"status":"open"}'::jsonb, ${at})`);
	const open = await gapsOf(ticket.id);

	await db.execute(sql`UPDATE review_threads SET document = '{"status":"resolved"}'::jsonb WHERE id = ${thread}`);

	expect(open).toEqual(["findings"]);
	expect(await gapsOf(ticket.id)).toEqual([]);
});

test("a conflict with the base branch takes a ready pull request back", async () => {
	const { ticket, id } = await readyPullRequest("Fix the conflict", 109);

	await db.execute(sql`UPDATE pull_requests SET mergeable = 'conflicting' WHERE id = ${id}`);
	const conflicting = await gapsOf(ticket.id);

	await db.execute(sql`UPDATE pull_requests SET mergeable = 'mergeable' WHERE id = ${id}`);

	expect(conflicting).toEqual(["conflict"]);
	expect(await gapsOf(ticket.id)).toEqual([]);
});

// A flow is machine review. A run of the current commit that succeeded
// answers the check, and so does the agent's own sentence when no flow fits.
test("a flow of the project asks for a run of the current commit", async () => {
	const { ticket, id } = await readyPullRequest("Run the flow", 110);

	await db.execute(sql`DELETE FROM flows`);
	await db.execute(sql`INSERT INTO flows (id, project_id, slug, name, description, created_at, updated_at)
		VALUES (${ulid()}, ${root}, 'review', 'Review', 'Read the diff.', ${at}, ${at})`);
	const noRun = await gapsOf(ticket.id);

	await db.execute(sql`INSERT INTO pr_flow_waivers
		(pull_request_id, head_sha, reason, actor_name, actor_kind, created_at, updated_at)
		VALUES (${id}, 'head110', 'No flow reads a migration.', 'claude-code', 'agent', ${at}, ${at})`);

	expect(noRun).toEqual(["flow-run"]);
	expect(await gapsOf(ticket.id)).toEqual([]);
});

// A flow belongs to one root project, or to every project. A flow of another
// project asks this pull request for nothing, and `trellis ready` answers the
// same, so the glyph cannot go grey with a part the agent can never supply.
test("a flow of another project asks this pull request for nothing", async () => {
	await db.execute(sql`DELETE FROM flows`);
	const other = ulid();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${other}, ${other}, 'OTH', 'oth', 'Other', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO flows (id, project_id, slug, name, description, created_at, updated_at)
		VALUES (${ulid()}, ${other}, 'other-review', 'Other review', 'Read the diff.', ${at}, ${at})`);

	const { ticket } = await readyPullRequest("Ignore another project's flow", 113);

	expect(await gapsOf(ticket.id)).toEqual([]);
});

test("a flow of every project asks this pull request for a run", async () => {
	await db.execute(sql`DELETE FROM flows`);
	await db.execute(sql`INSERT INTO flows (id, project_id, slug, name, description, created_at, updated_at)
		VALUES (${ulid()}, NULL, 'every-project', 'Every project', 'Read the diff.', ${at}, ${at})`);

	const { ticket } = await readyPullRequest("Run the flow of every project", 114);

	expect(await gapsOf(ticket.id)).toEqual(["flow-run"]);
});

// What gh answers for one pull request. The poller writes this row, so a
// test drives the poll path with it. `contentHash` differs per call, so
// every write counts as a change.
const fetched = (number: number, headSha: string, state: "open" | "merged"): PullRequestRow => ({
	owner: "acme",
	repo: "app",
	number,
	additions: 1,
	deletions: 1,
	changedFiles: 1,
	files: [],
	url: `https://github.com/acme/app/pull/${number}`,
	title: "Add the rule",
	state,
	isDraft: false,
	isQueued: false,
	headSha,
	headRef: "fix",
	baseRef: "main",
	mergeable: "mergeable",
	reviewState: "none",
	mergedAt: state === "merged" ? later.toISOString() : null,
	closedAt: null,
	checks: [],
	ciState: "none",
	contentHash: ulid(),
});

const poll = (number: number, headSha: string, state: "open" | "merged" = "open") =>
	run((tx) => upsertPullRequests(tx, later, [fetched(number, headSha, state)]));

// The poller is the path that finds a push on its own, so it clears the
// moment without anybody running a command.
test("a poll that finds a new head commit clears the moment the wait started", async () => {
	const { id } = await readyPullRequest("Poll after a push", 116);
	await poll(116, "head116");

	const kept = await readyAtOf(id);
	await poll(116, "pushed116");

	expect(kept).toBe(at.toISOString());
	expect(await readyAtOf(id)).toBeNull();
});

// The wait ends at the merge, and the product measures how long it was, so
// the merge leaves the moment it started.
test("a merge leaves the moment the wait started", async () => {
	const { id } = await readyPullRequest("Merge after the ask", 117);

	await poll(117, "head117", "merged");

	expect(await readyAtOf(id)).toBe(at.toISOString());
});

// A push clears the moment and leaves the stored state at `ready`, so the
// next ask has no state to move. It stamps the new wait all the same.
test("the ask after a push stamps the new wait and writes a second timeline row", async () => {
	const { id } = await readyPullRequest("Ask again after a push", 115);
	await run((tx) => setHeadSha(tx, { id, headSha: "pushed115" }));

	const again = await run((tx) => setLocalState(ctxOf(agent, later), tx, { id, localState: "ready" }));

	expect(again.localState).toBe("ready");
	expect(again.readyForReviewAt).toBe(later.toISOString());
	expect(await activityOf(id)).toEqual([
		["pr.ready_for_review", "agent", "claude-code"],
		["pr.ready_for_review", "agent", "claude-code"],
	]);
});
