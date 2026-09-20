import { afterAll, beforeAll, expect, test } from "bun:test";
import { ReviewStatusSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import type { ServiceCtx } from "../support.ts";
import { status } from "./queries.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const root = ulid();
const statusId = ulid();
const at = new Date("2026-09-20T12:00:00.000Z");
const pr = "acme/app#28";

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('Test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${root}, ${root}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, color, position, is_default, created_at, updated_at
	) VALUES (${statusId}, ${root}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	const laterTicket = ulid();
	const firstTicket = ulid();
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, root_id, number, title, status_id, position, created_at, updated_at
	) VALUES
		(${laterTicket}, ${root}, ${root}, 9, 'Later ticket', ${statusId}, 0, ${at}, ${at}),
		(${firstTicket}, ${root}, ${root}, 2, 'First ticket', ${statusId}, 1, ${at}, ${at})`);
	const prId = ulid();
	await db.execute(sql`INSERT INTO pull_requests (
		id, owner, repo, number, url, state, is_draft, head_ref, base_ref,
		review_state, checks, ci_state, created_at, updated_at
	) VALUES (
		${prId}, 'acme', 'app', 28, 'https://github.com/acme/app/pull/28', 'open', false,
		'feature', 'main', 'review_required', '[]', 'pass', ${at}, ${at}
	)`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (
		ticket_id, pull_request_id, source, actor_name, actor_kind, created_at
	) VALUES
		(${laterTicket}, ${prId}, 'manual', 'Test', 'human', ${at}),
		(${firstTicket}, ${prId}, 'manual', 'Test', 'human', ${at})`);
});

afterAll(async () => {
	await db.$client.close();
});

test("review status returns the first linked ticket and its pull request row", async () => {
	const result = await db.transaction((tx) => status({} as ServiceCtx, tx, { pr, remote: { title: "GitHub title" } }));
	expect(ReviewStatusSchema.parse(result)).toEqual(result);
	expect(result).toMatchObject({
		title: "GitHub title",
		ticket: { identifier: "TST-2", title: "First ticket" },
		prRow: { number: 28, owner: "acme", repo: "app" },
	});
});

test("review status returns null row facts for an unlinked pull request", async () => {
	const result = await db.transaction((tx) => status({} as ServiceCtx, tx, { pr: "acme/app#29", remote: {} }));
	expect(ReviewStatusSchema.parse(result)).toEqual(result);
	expect(result).toEqual({ ticket: null, prRow: null });
});
