import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { prs } from "../services/reviews/prs.ts";
import type { IoCtx } from "../services/support.ts";
import { createCache } from "./cache.ts";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

// Two roots. TST has the repository acme/app and a sub-project web. The
// ticket TST-1 sits in web and links the pull request `linked`. The pull
// request `retained` is kept for review in acme/app and links no ticket.
// OTH has no repository; its ticket OTH-1 links `other`, and `elsewhere` is
// kept for review in a repository no project has.
let db: Db;
let ctx: IoCtx;
const at = new Date("2026-09-17T10:00:00.000Z");
const tst = ulid();
const web = ulid();
const oth = ulid();
const pulls = { linked: ulid(), retained: ulid(), other: ulid(), elsewhere: ulid() };

const insertProject = (id: string, root: string, parent: string | null, key: string | null, slug: string) =>
	db.execute(sql`INSERT INTO projects (id, root_id, parent_id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${root}, ${parent}, ${key}, ${slug}, ${slug}, ${at}, ${at})`);

// The one status of a root. Every ticket of the root takes it.
const insertStatus = async (root: string) => {
	const id = ulid();
	await db.execute(sql`INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${id}, ${root}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	return id;
};

const insertTicket = (id: string, project: string, root: string, status: string, number: number) =>
	db.execute(sql`INSERT INTO tickets (id, project_id, root_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${id}, ${project}, ${root}, ${number}, 'Task', ${status}, 0, ${at}, ${at})`);

const insertPull = (id: string, owner: string, repo: string, number: number, retained: boolean) =>
	db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, review_retained, created_at, updated_at)
		VALUES (${id}, ${owner}, ${repo}, ${number}, ${`https://github.com/${owner}/${repo}/pull/${number}`}, 'open', ${retained}, ${at}, ${at})`);

const link = (ticket: string, pull: string) =>
	db.execute(sql`INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
		VALUES (${ticket}, ${pull}, 'manual', 'Test', 'human', ${at})`);

beforeAll(async () => {
	db = await openDb(":memory:");
	await migrate(db);
	await db.execute(
		sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES ('Test', 'human', ${at}, ${at})`,
	);
	await insertProject(tst, tst, null, "TST", "tst");
	await insertProject(web, tst, tst, null, "web");
	await insertProject(oth, oth, null, "OTH", "oth");
	await db.execute(sql`INSERT INTO repos (id, project_id, owner, repo) VALUES (${ulid()}, ${tst}, 'acme', 'app')`);
	const tst1 = ulid();
	const oth1 = ulid();
	await insertTicket(tst1, web, tst, await insertStatus(tst), 1);
	await insertTicket(oth1, oth, oth, await insertStatus(oth), 1);
	await insertPull(pulls.linked, "acme", "app", 1, false);
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

test("a sub-project inherits the repositories of its ancestors", async () => {
	expect(await idsOf("TST.web")).toEqual([pulls.linked, pulls.retained].sort());
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
