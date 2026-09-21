import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { list } from "../agentRuns/agentRuns.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const rootId = ulid();
const childId = ulid();
const rootTicketId = ulid();
const childTicketId = ulid();
const rootSessionId = ulid();
const childSessionId = ulid();
const rootTicketRunId = ulid();
const childTicketRunId = ulid();
const at = "2026-09-21T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at) VALUES
		(${rootId}, ${rootId}, 'SCP', 'scope', 'Scope', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, parent_id, root_id, slug, name, created_at, updated_at) VALUES
		(${childId}, ${rootId}, ${rootId}, 'child', 'Child', ${at}, ${at})`);
	const statusId = ulid();
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at) VALUES
		(${statusId}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, root_id, number, title, status_id, position, created_at, updated_at) VALUES
		(${rootTicketId}, ${rootId}, ${rootId}, 1, 'Root task', ${statusId}, 0, ${at}, ${at}),
		(${childTicketId}, ${childId}, ${rootId}, 2, 'Child task', ${statusId}, 0, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_path, ticket_id, ticket_identifier, created_at, updated_at) VALUES
		(${rootSessionId}, 'root-session', 'session', 'Root', ${rootId}, 'SCP', NULL, NULL, ${at}, ${at}),
		(${childSessionId}, 'child-session', 'session', 'Child', ${childId}, 'SCP.child', NULL, NULL, ${at}, ${at}),
		(${rootTicketRunId}, 'root-ticket', 'agent', 'Root ticket', ${childId}, 'SCP.child', ${rootTicketId}, 'SCP-1', ${at}, ${at}),
		(${childTicketRunId}, 'child-ticket', 'agent', 'Child ticket', ${rootId}, 'SCP', ${childTicketId}, 'SCP-2', ${at}, ${at})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: null,
		session: null,
		reqId: ulid(),
		now: new Date(at),
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

afterAll(async () => db.$client.close());

test("a project lists its sessions and the runs of its current tickets", async () => {
	const rootRuns = await run((tx) => list(ctx, tx, { project: rootId }));
	const childRuns = await run((tx) => list(ctx, tx, { project: childId }));
	expect(rootRuns.map(({ id }) => id).sort()).toEqual([rootSessionId, rootTicketRunId].sort());
	expect(childRuns.map(({ id }) => id).sort()).toEqual([childSessionId, childTicketRunId].sort());
});
