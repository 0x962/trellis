import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Check } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache, type ProjectCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import type { PullRequestRow } from "../../gh/graphql.ts";
import { refresh } from "../pullRequests.ts";
import type { IoCtx } from "../support.ts";
import { completeMergedPullRequestTickets, doneByPullRequestsTimelineText } from "./completeMergedPullRequests.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let cache: ProjectCache;
let ctx: ServiceCtx;

const root = ulid();
const review = ulid();
const done = ulid();
const canceled = ulid();
const at = new Date("2026-09-21T10:00:00.000Z");
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeEach(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${root}, 'MRG', 'mrg', 'Merge', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('dana', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES
		(${ulid()}, ${root}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true, ${at}, ${at}),
		(${review}, ${root}, 'Agent Review', 'agent-review', 'review', 'agent', 'agent', 1, false, ${at}, ${at}),
		(${done}, ${root}, 'Done', 'done', 'done', NULL, 'success', 2, false, ${at}, ${at}),
		(${canceled}, ${root}, 'Canceled', 'canceled', 'canceled', NULL, 'fg-muted', 3, false, ${at}, ${at})`);
	cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "dana" },
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
});

afterEach(async () => {
	await db.$client.close();
});

const ticket = async (number: number, status = review) => {
	const id = ulid();
	const completedAt = status === done || status === canceled ? at : null;
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, completed_at, created_at, updated_at)
		VALUES (${id}, ${root}, ${number}, ${`Ticket ${number}`}, ${status}, ${number}, ${completedAt}, ${at}, ${at})`);
	return id;
};

const pr = async (number: number, state: "open" | "closed" | "merged") => {
	const id = ulid();
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, is_draft, fetched_at, created_at, updated_at, merged_at, closed_at)
		VALUES (
			${id}, 'acme', 'app', ${number}, ${`https://github.com/acme/app/pull/${number}`}, ${state}, false,
			${at}, ${at}, ${at}, ${state === "merged" ? at : null}, ${state === "closed" ? at : null}
		)`);
	return id;
};

const link = (ticketId: string, prId: string) =>
	db.execute(sql`INSERT INTO ticket_pull_requests
		(ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticketId}, ${prId}, 'manual', 'dana', 'human', ${at})`);

const ticketState = async (ticketId: string) => {
	const [row] = (
		await db.execute(sql`
		SELECT s.category, t.completed_at IS NOT NULL AS completed
		FROM tickets t JOIN statuses s ON s.id = t.status_id
		WHERE t.id = ${ticketId}
	`)
	).rows as { category: string; completed: boolean }[];
	return row!;
};

const timelineRows = async (ticketId: string) =>
	(
		await db.execute(sql`
		SELECT actor_name AS "actorName", actor_kind AS "actorKind", action, field, to_value AS "toValue"
		FROM activity
		WHERE ticket_id = ${ticketId}
		ORDER BY id
	`)
	).rows;

test("all merged pull requests move the ticket to Done with a system timeline row", async () => {
	const ticketId = await ticket(1);
	await link(ticketId, await pr(1, "merged"));
	await link(ticketId, await pr(2, "merged"));

	await run((tx) => completeMergedPullRequestTickets(ctx, tx));

	expect(await ticketState(ticketId)).toEqual({ category: "done", completed: true });
	expect(await timelineRows(ticketId)).toContainEqual({
		actorName: "trellis",
		actorKind: "system",
		action: "ticket.updated",
		field: "status",
		toValue: "Done",
	});
	expect(await timelineRows(ticketId)).toContainEqual({
		actorName: "trellis",
		actorKind: "system",
		action: "ticket.done_by_pull_requests",
		field: null,
		toValue: doneByPullRequestsTimelineText,
	});
});

test("one open pull request keeps the ticket open", async () => {
	const ticketId = await ticket(2);
	await link(ticketId, await pr(3, "merged"));
	await link(ticketId, await pr(4, "open"));

	await run((tx) => completeMergedPullRequestTickets(ctx, tx));

	expect(await ticketState(ticketId)).toEqual({ category: "review", completed: false });
	expect(await timelineRows(ticketId)).toEqual([]);
});

test("closed pull requests with no merge keep the ticket open", async () => {
	const ticketId = await ticket(3);
	await link(ticketId, await pr(5, "closed"));

	await run((tx) => completeMergedPullRequestTickets(ctx, tx));

	expect(await ticketState(ticketId)).toEqual({ category: "review", completed: false });
	expect(await timelineRows(ticketId)).toEqual([]);
});

test("a canceled ticket stays canceled", async () => {
	const ticketId = await ticket(4, canceled);
	await link(ticketId, await pr(6, "merged"));

	await run((tx) => completeMergedPullRequestTickets(ctx, tx));

	expect(await ticketState(ticketId)).toEqual({ category: "canceled", completed: true });
	expect(await timelineRows(ticketId)).toEqual([]);
});

test("refresh moves the linked ticket at once", async () => {
	const ticketId = await ticket(5);
	const prId = await pr(7, "open");
	await link(ticketId, prId);
	const row = pullRequestRow(7, "merged");
	const ioCtx = {
		...ctx,
		core: ctx,
		now: () => at,
	} as unknown as IoCtx;

	await run((tx) =>
		refresh(ioCtx, tx, { id: prId, first: { ref: { owner: row.owner, repo: row.repo, number: row.number }, row } }),
	);

	expect(await ticketState(ticketId)).toEqual({ category: "done", completed: true });
	expect(await timelineRows(ticketId)).toContainEqual(
		expect.objectContaining({ action: "ticket.done_by_pull_requests", toValue: doneByPullRequestsTimelineText }),
	);
});

const pullRequestRow = (number: number, state: "open" | "closed" | "merged"): PullRequestRow => ({
	owner: "acme",
	repo: "app",
	number,
	additions: 1,
	deletions: 1,
	changedFiles: 1,
	files: [],
	url: `https://github.com/acme/app/pull/${number}`,
	title: "Finish the ticket",
	state,
	isDraft: false,
	isQueued: false,
	headSha: "abc1234",
	headRef: "feature",
	baseRef: "main",
	mergeable: "mergeable",
	reviewState: "none",
	mergedAt: state === "merged" ? at.toISOString() : null,
	closedAt: state === "closed" ? at.toISOString() : null,
	checks: [] satisfies Check[],
	ciState: "none",
	contentHash: ulid(),
});
