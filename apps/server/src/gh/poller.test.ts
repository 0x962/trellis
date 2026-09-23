import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createCache, type ProjectCache } from "../db/cache.ts";
import { openTestDb } from "../db/testDb.ts";
import { start } from "./poller.ts";
import type { GhRunner } from "./run.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let cache: ProjectCache;

const root = ulid();
const review = ulid();
const done = ulid();
const at = new Date("2026-09-21T10:00:00.000Z");
const old = new Date("2026-09-19T10:00:00.000Z");

beforeEach(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${root}, 'PLR', 'plr', 'Poller', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('dana', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES
		(${ulid()}, ${root}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at}),
		(${review}, ${root}, 'Agent Review', 'agent-review', 'review', 'agent', 1, false, ${at}, ${at}),
		(${done}, ${root}, 'Done', 'done', 'done', 'success', 2, false, ${at}, ${at})`);
	cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
});

afterEach(async () => {
	await db.$client.close();
});

test("a poller tick moves a ticket whose linked pull requests are already terminal", async () => {
	const ticketId = ulid();
	const prId = ulid();
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${ticketId}, ${root}, 1, 'Finish after merge', ${review}, 1, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, is_draft, fetched_at, created_at, updated_at, merged_at)
		VALUES (${prId}, 'acme', 'app', 8, 'https://github.com/acme/app/pull/8', 'merged', false, ${old}, ${old}, ${old}, ${old})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests
		(ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticketId}, ${prId}, 'manual', 'dana', 'human', ${old})`);
	const gh = Object.assign(async () => ({ ok: true, code: 0, stdout: "", stderr: "" }), {
		bin: "gh",
		timeoutMs: 1000,
	}) as GhRunner;
	const handle = start({
		db,
		cache,
		actorCache: new Map(),
		publicUrl: "http://localhost:4597",
		gh,
		sink: () => {},
		log: () => {},
		now: () => at,
		setTimer: () => 1,
		clearTimer: () => {},
	});

	await handle.tick();
	await handle.stop();

	const [row] = (
		await db.execute(sql`
		SELECT s.category, t.completed_at IS NOT NULL AS completed
		FROM tickets t JOIN statuses s ON s.id = t.status_id
		WHERE t.id = ${ticketId}
	`)
	).rows as { category: string; completed: boolean }[];
	expect(row).toEqual({ category: "done", completed: true });
});
