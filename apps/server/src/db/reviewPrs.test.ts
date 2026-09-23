import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Check } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { prs } from "../services/reviews/prs.ts";
import type { IoCtx } from "../services/support.ts";
import { createCache } from "./cache.ts";
import type { Db } from "./client.ts";
import { openTestDb } from "./testDb.ts";

// Two projects. TST has the repository acme/app, and its ticket TST-1 links
// the pull request `linked`. The pull request `retained` is kept for review
// in acme/app and links no ticket. OTH has no repository; its ticket OTH-1
// links `other`, and `elsewhere` is kept for review in a repository no
// project has.
let db: Db;
let ctx: IoCtx;
const at = new Date("2026-09-17T10:00:00.000Z");
const tst = ulid();
const oth = ulid();
const pulls = { linked: ulid(), retained: ulid(), other: ulid(), elsewhere: ulid() };

const insertProject = (id: string, key: string, slug: string) =>
	db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${slug}, ${slug}, ${at}, ${at})`);

// The one status of a project. Every ticket of the project takes it.
const insertStatus = async (root: string) => {
	const id = ulid();
	await db.execute(sql`INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${id}, ${root}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	return id;
};

const insertTicket = (id: string, project: string, status: string, number: number) =>
	db.execute(sql`INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${id}, ${project}, ${number}, 'Task', ${status}, 0, ${at}, ${at})`);

const ciStateOf = (checks: readonly { bucket: string }[]) => {
	if (checks.some((check) => check.bucket === "fail" || check.bucket === "cancel")) return "fail";
	if (checks.some((check) => check.bucket === "pending")) return "pending";
	if (checks.some((check) => check.bucket === "pass")) return "pass";
	return "none";
};

const insertPull = (
	id: string,
	owner: string,
	repo: string,
	number: number,
	retained: boolean,
	checks: readonly Check[] = [],
) =>
	db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, review_retained, checks, ci_state, created_at, updated_at)
		VALUES (${id}, ${owner}, ${repo}, ${number}, ${`https://github.com/${owner}/${repo}/pull/${number}`}, 'open', ${retained}, ${JSON.stringify(checks)}::jsonb, ${ciStateOf(checks)}, ${at}, ${at})`);

const link = (ticket: string, pull: string) =>
	db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket}, ${pull}, 'manual', 'Test', 'human', ${at})`);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(
		sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES ('Test', 'human', ${at}, ${at})`,
	);
	await insertProject(tst, "TST", "tst");
	await insertProject(oth, "OTH", "oth");
	await db.execute(sql`INSERT INTO repos (id, project_id, owner, repo) VALUES (${ulid()}, ${tst}, 'acme', 'app')`);
	const tst1 = ulid();
	const oth1 = ulid();
	await insertTicket(tst1, tst, await insertStatus(tst), 1);
	await insertTicket(oth1, oth, await insertStatus(oth), 1);
	await insertPull(pulls.linked, "acme", "app", 1, false, [
		{
			name: "lint",
			workflow: "CI",
			bucket: "fail",
			link: "https://checks.example/lint",
			startedAt: "2026-09-21T10:00:00.000Z",
			endedAt: "2026-09-21T10:00:31.000Z",
		},
	]);
	await insertPull(pulls.retained, "acme", "app", 2, true);
	await insertPull(pulls.other, "other", "repo", 3, false);
	await insertPull(pulls.elsewhere, "other", "repo", 4, true);
	await link(tst1, pulls.linked);
	await link(oth1, pulls.other);
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const actor = { name: "Test", kind: "human" as const };
	ctx = {
		actor,
		session: null,
		home: "",
		maxUploadBytes: 1024,
		version: "test",
		apiVersion: "test",
		bootId: "test",
		now: () => at,
		ghStatus: () => {
			throw new Error("No GitHub request in this test.");
		},
		addresses: async () => [],
		log: () => undefined,
		emit: () => {},
		afterCommit: () => {},
		background: () => {
			throw new Error("Unexpected background task");
		},
		newTx: (fn) => db.transaction(fn),
		vacuum: async () => {},
		localUrl: "http://localhost:4597",
		publicUrl: "http://localhost:4597",
		core: {
			actor,
			session: null,
			reqId: ulid(),
			now: at,
			cache,
			actorCache: new Map(),
			emit: () => {},
			dropBlobs: () => {},
			publicUrl: "http://localhost:4597",
		},
	};
});

afterAll(async () => {
	await db?.$client.close();
});

const idsOf = (project?: string) =>
	db.transaction(async (tx) => (await prs(ctx, tx, { project })).map((pr) => pr.id).sort());

test("a project lists the pull requests of its tickets and its repositories", async () => {
	expect(await idsOf("TST")).toEqual([pulls.linked, pulls.retained].sort());
});

test("a project without a repository lists the pull requests of its tickets only", async () => {
	expect(await idsOf("OTH")).toEqual([pulls.other]);
});

test("no project lists every pull request kept for a local review", async () => {
	expect(await idsOf()).toEqual([pulls.retained, pulls.elsewhere].sort());
});

test("a partial pull request row keeps an unknown size", async () => {
	const size = await db.execute(
		sql`SELECT additions, deletions, changed_files FROM pull_requests WHERE id = ${pulls.linked}`,
	);
	expect(size.rows[0]).toEqual({ additions: null, deletions: null, changed_files: null });
});

test("a pull request row carries check state", async () => {
	const list = await db.transaction((tx) => prs(ctx, tx, { project: "TST" }));
	const linked = list.find((pr) => pr.id === pulls.linked)!;

	expect(linked.ciState).toBe("fail");
	expect(linked.checks).toEqual([
		{
			name: "lint",
			workflow: "CI",
			bucket: "fail",
			link: "https://checks.example/lint",
			startedAt: "2026-09-21T10:00:00.000Z",
			endedAt: "2026-09-21T10:00:31.000Z",
		},
	]);
});
