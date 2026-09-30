import type { Check } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../../context.ts";
import { createCache } from "../../../db/cache.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { Tx } from "../../../db/tx.ts";
import type { PullRequestRow } from "../../../gh/graphql.ts";
import type { IoCtx } from "../../support.ts";

const root = ulid();
export const review = ulid();
export const done = ulid();
export const canceled = ulid();
const at = new Date("2026-09-21T10:00:00.000Z");
export async function mergeFixture() {
	const db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${root}, 'MRG', 'mrg', 'Merge', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('dana', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES
		(${ulid()}, ${root}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at}),
		(${review}, ${root}, 'Agent Review', 'agent-review', 'review', 'agent', 1, false, ${at}, ${at}),
		(${done}, ${root}, 'Done', 'done', 'done', 'success', 2, false, ${at}, ${at}),
		(${canceled}, ${root}, 'Canceled', 'canceled', 'canceled', 'fg-muted', 3, false, ${at}, ${at})`);
	const cache = createCache();
	const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
	await run((tx) => cache.rebuild(tx));
	const core: ServiceCtx = {
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
	const ctx = { ...core, core, now: () => at, newTx: run } as unknown as IoCtx;

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
		(ticket_id, pull_request_id, source, actor_name, actor_kind, created_at, actor_id)
		VALUES (${ticketId}, ${prId}, 'manual', 'dana', 'human', ${at}, (SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY['human', 'dana']::text[]))`);

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

	return { db, ctx, run, ticket, pr, link, ticketState, timelineRows, root };
}

export const pullRequestRow = (number: number, state: "open" | "closed" | "merged"): PullRequestRow => ({
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
	queuePosition: null,
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
