import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "../client.ts";
import { openTestDb } from "../testDb.ts";
import { flowAnsweredSql } from "./reviewReady.ts";

// One project TST with one flow, one ticket TST-1, and one pull request the
// ticket links. Each test moves the head of that pull request and asks
// `flowAnsweredSql` whether the flow check still needs a run.
let db: Db;
const at = new Date("2026-09-23T10:00:00.000Z");
const project = ulid();
const ticket = ulid();
const flow = ulid();
const pull = ulid();

const answered = async (diffId = pull): Promise<boolean> => {
	const found = await db.execute(
		sql`SELECT ${flowAnsweredSql(sql`p`)} AS answered FROM pull_requests p WHERE p.id = ${diffId}`,
	);
	return (found.rows[0] as { answered: boolean }).answered;
};

// Moves the pull request to a new commit, the way a push does.
const push = (headSha: string) => db.execute(sql`UPDATE pull_requests SET head_sha = ${headSha} WHERE id = ${pull}`);

const insertRun = (headSha: string, status: string, diffId = pull) =>
	db.execute(sql`INSERT INTO flow_executions (
		id, flow_id, ticket_id, project_id, actor_kind, actor_name, request_id,
		request, head_sha, doc, state, revision, created_at, updated_at, diff_id
	) VALUES (
		${ulid()}, ${flow}, ${ticket}, ${project}, 'agent', 'Builder', ${ulid()},
		'{}', ${headSha}, ${{ flow: { slug: "review", name: "Review" } }}, ${{ status }}, 1, ${at}, ${at}, ${diffId}
	)`);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(
		sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES ('Builder', 'agent', ${at}, ${at})`,
	);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${project}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	const status = ulid();
	await db.execute(sql`INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${status}, ${project}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${ticket}, ${project}, 1, 'Task', ${status}, 0, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO flows (id, project_id, slug, name, created_at, updated_at)
		VALUES (${flow}, ${project}, 'review', 'Review', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, head_sha, created_at, updated_at)
		VALUES (${pull}, 'acme', 'app', 1, 'https://github.com/acme/app/pull/1', 'open', 'commit1', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket}, ${pull}, 'manual', 'Builder', 'agent', ${at})`);
});

afterAll(async () => {
	await db?.$client.close();
});

test("asks for a run while the pull request holds none", async () => {
	expect(await answered()).toBe(false);
});

test("asks for a run while the only run did not succeed", async () => {
	await insertRun("commit1", "failed");

	expect(await answered()).toBe(false);
});

test("keeps a succeeded run through three later commits", async () => {
	await insertRun("commit1", "succeeded");
	expect(await answered()).toBe(true);

	for (const commit of ["commit2", "commit3", "commit4"]) {
		await push(commit);
		expect(await answered()).toBe(true);
	}
});

test("keeps the agent's sentence through a later commit", async () => {
	await db.execute(sql`DELETE FROM flow_executions WHERE ticket_id = ${ticket}`);
	await db.execute(sql`INSERT INTO pr_flow_waivers (pull_request_id, head_sha, reason, actor_name, actor_kind, created_at, updated_at)
		VALUES (${pull}, 'commit4', 'This change edits only the README.', 'Builder', 'agent', ${at}, ${at})`);
	await push("commit5");

	expect(await answered()).toBe(true);
});

test("a completed review applies only to its diff when a ticket has two diffs", async () => {
	const other = ulid();
	await insertRun("commit5", "succeeded");
	await db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, head_sha, created_at, updated_at)
		VALUES (${other}, 'acme', 'app', 2, 'https://github.com/acme/app/pull/2', 'open', 'commit5', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket}, ${other}, 'manual', 'Builder', 'agent', ${at})`);
	expect(await answered(other)).toBe(false);
	await insertRun("commit5", "succeeded", other);
	expect(await answered(other)).toBe(true);
});
