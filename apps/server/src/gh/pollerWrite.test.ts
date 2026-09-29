import { afterAll, beforeAll, expect, test } from "bun:test";
import type { CiState, PrState } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { openTestDb } from "../db/testDb.ts";
import type { DueRow } from "./pollerDue.ts";
import { type Polled, upsertPullRequests, writePolled } from "./pollerWrite.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const at = new Date("2026-09-29T21:40:00Z");
const projectId = ulid();
const statusId = ulid();
const ticketId = ulid();

const pullRequestRow = (state: PrState, ciState: CiState) => ({
	owner: "0x962",
	repo: "trellis",
	number: 850,
	additions: 1,
	deletions: 1,
	changedFiles: 1,
	files: [],
	url: "https://github.com/0x962/trellis/pull/850",
	title: "Preserve actor links",
	state,
	isDraft: true,
	isQueued: false,
	queuePosition: null,
	headSha: "abcdef0",
	headRef: "actor-links",
	baseRef: "main",
	mergeable: "mergeable" as const,
	reviewState: "none" as const,
	mergedAt: null,
	closedAt: null,
	checks: [],
	ciState,
	contentHash: ulid(),
});

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'POL', 'poller', 'Poller', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, description, priority, status_id, position, version, created_at, updated_at)
		VALUES (${ticketId}, ${projectId}, 1, 'Poll a pull request', '', 'none', ${statusId}, 0, 1, ${at}, ${at})`);
	await db.transaction((tx) => upsertPullRequests(tx, at, [pullRequestRow("open", "pending")]));
	const pullRequest = (await db.execute(sql`SELECT id FROM pull_requests WHERE number = 850`)).rows[0] as {
		id: string;
	};
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('dana', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests
		(ticket_id, pull_request_id, source, actor_id, actor_name, actor_kind, created_at)
		VALUES (${ticketId}, ${pullRequest.id}, 'manual',
			(SELECT id FROM actors WHERE name = 'dana' AND kind = 'human'), 'dana', 'human', ${at})`);
}, 30_000);

afterAll(async () => db.$client.close());

test("writes one linked-ticket activity row for a pull request state change", async () => {
	const pullRequest = (await db.execute(sql`SELECT id FROM pull_requests WHERE number = 850`)).rows[0] as {
		id: string;
	};
	const stored: DueRow = {
		id: pullRequest.id,
		owner: "0x962",
		repo: "trellis",
		number: 850,
		state: "open",
		ci_state: "pending",
		content_hash: null,
		fetch_error: null,
		fetched_at: at.toISOString(),
		interval_ms: 30_000,
	};
	const written: Polled = { stored, row: pullRequestRow("merged", "pass") };
	const events: unknown[] = [];
	const ctx = { now: at, actorCache: new Map() } as ServiceCtx;
	await db.transaction((tx) =>
		writePolled(ctx, tx, (event) => events.push(event), { at, written: [written], failed: [] }),
	);

	const activity = await db.execute(sql`SELECT a.actor_id, a.actor_name, a.actor_kind, a.action, a.meta
		FROM activity a WHERE a.ticket_id = ${ticketId} AND a.action = 'pr.state_changed'`);
	expect(activity.rows).toEqual([
		{
			actor_id: expect.any(String),
			actor_name: "trellis",
			actor_kind: "system",
			action: "pr.state_changed",
			meta: { pullRequestId: pullRequest.id, from: "open/pending", to: "merged/pass" },
		},
	]);
	expect(events).toHaveLength(1);
});
