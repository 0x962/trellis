import { afterAll, beforeAll, expect, test } from "bun:test";
import { ReviewStatusSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import type { ServiceCtx } from "../support.ts";
import { status } from "./status.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const root = ulid();
const todoStatusId = ulid();
const firstRoot = ulid();
const firstRootTodoStatusId = ulid();
const at = new Date("2026-09-20T12:00:00.000Z");
const pr = "acme/app#28";

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('Test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES
			(${root}, ${root}, 'TST', 'tst', 'Test', ${at}, ${at}),
			(${firstRoot}, ${firstRoot}, 'AAA', 'aaa', 'First project', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, color, position, is_default, created_at, updated_at
	) VALUES
		(${todoStatusId}, ${root}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at}),
		(${firstRootTodoStatusId}, ${firstRoot}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	const laterNumberTicket = ulid();
	const lowerNumberTicket = ulid();
	const firstProjectTicket = ulid();
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, root_id, number, title, status_id, position, created_at, updated_at
	) VALUES
		(${laterNumberTicket}, ${root}, ${root}, 9, 'Later ticket', ${todoStatusId}, 0, ${at}, ${at}),
		(${lowerNumberTicket}, ${root}, ${root}, 2, 'Lower number ticket', ${todoStatusId}, 1, ${at}, ${at}),
		(${firstProjectTicket}, ${firstRoot}, ${firstRoot}, 7, 'First project ticket', ${firstRootTodoStatusId}, 0, ${at}, ${at})`);
	const prId = ulid();
	await db.execute(sql`INSERT INTO pull_requests (
		id, owner, repo, number, changed_files, files, url, state, is_draft, is_queued, head_ref, base_ref,
		review_state, checks, ci_state, created_at, updated_at
	) VALUES (
		${prId}, 'acme', 'app', 28, 1, '[{"path":"backend/service.ts","change":"change","additions":1,"deletions":0}]',
		'https://github.com/acme/app/pull/28', 'open', false, true,
		'feature', 'main', 'review_required', '[]', 'pass', ${at}, ${at}
	)`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (
		ticket_id, pull_request_id, source, actor_name, actor_kind, created_at
	) VALUES
		(${laterNumberTicket}, ${prId}, 'manual', 'Test', 'human', ${at}),
		(${lowerNumberTicket}, ${prId}, 'manual', 'Test', 'human', ${at}),
		(${firstProjectTicket}, ${prId}, 'manual', 'Test', 'human', ${at})`);
});

afterAll(async () => {
	await db.$client.close();
});

test("review status sorts linked tickets by project key and ticket number", async () => {
	const result = await db.transaction((tx) => status({} as ServiceCtx, tx, { pr, remote: { title: "GitHub title" } }));
	expect(ReviewStatusSchema.parse(result)).toEqual(result);
	expect(result).toMatchObject({
		title: "GitHub title",
		isQueued: true,
		ticket: { identifier: "AAA-7", title: "First project ticket" },
		prRow: { number: 28, owner: "acme", repo: "app", kind: "backend" },
	});
	expect(result.prRow).not.toHaveProperty("files");
});

test("review status returns null row facts for an unlinked pull request", async () => {
	const result = await db.transaction((tx) => status({} as ServiceCtx, tx, { pr: "acme/app#29", remote: {} }));
	expect(ReviewStatusSchema.parse(result)).toEqual(result);
	expect(result).toEqual({ isQueued: false, ticket: null, prRow: null });
});
