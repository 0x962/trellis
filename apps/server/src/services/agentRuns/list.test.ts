import { afterAll, beforeAll, expect, test } from "bun:test";
import { AgentRunListInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { list } from "./agentRuns.ts";
import { projectRun } from "./liveState.ts";
import { getRun, storeObservedActivity } from "./queries.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const projectId = ulid();
const now = new Date("2026-09-23T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
// Every run below is closed unless the row says otherwise, so the time of
// its last stored change decides whether the list keeps it.
const openRun = ulid();
const freshRun = ulid();
const recentActivityRun = ulid();
const oldRun = ulid();
const olderRun = ulid();
const flowRun = ulid();
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const listRuns = (input: {
	project?: string;
	ids?: string[];
	includePinnedHistory?: boolean;
	limit?: number;
	windowHours?: number;
}) => run((tx) => list(ctx, tx, AgentRunListInputSchema.parse(input)));

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES
		(${projectId}, 'LST', 'list', 'List', ${hoursAgo(300)}, ${hoursAgo(300)})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, pinned_at, closed_at, created_at, updated_at) VALUES
		(${openRun}, 'open', 'session', 'Open prompt.', ${projectId}, 'LST', NULL, NULL, ${hoursAgo(200)}, ${hoursAgo(200)}),
		(${freshRun}, 'fresh', 'session', 'Fresh prompt.', ${projectId}, 'LST', NULL, ${hoursAgo(2)}, ${hoursAgo(3)}, ${hoursAgo(2)}),
		(${recentActivityRun}, 'recent activity', 'session', 'Recent prompt.', ${projectId}, 'LST', NULL, ${hoursAgo(40)}, ${hoursAgo(200)}, ${hoursAgo(1.5)}),
		(${oldRun}, 'old', 'session', 'Old prompt.', ${projectId}, 'LST', ${hoursAgo(1)}, ${hoursAgo(40)}, ${hoursAgo(48)}, ${hoursAgo(40)}),
		(${olderRun}, 'older', 'session', 'Older prompt.', ${projectId}, 'LST', ${hoursAgo(2)}, ${hoursAgo(100)}, ${hoursAgo(120)}, ${hoursAgo(100)}),
		(${flowRun}, 'flow', 'flow', 'Review.', ${projectId}, 'LST', NULL, ${hoursAgo(1)}, ${hoursAgo(1)}, ${hoursAgo(1)})`);
	await db.execute(sql`INSERT INTO agent_execution_attempts (id, run_id, generation, token_hash, created_at)
		VALUES (${ulid()}, ${recentActivityRun}, 1, 'hash', ${hoursAgo(1.5)})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "dana" },
		session: null,
		reqId: ulid(),
		now,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

afterAll(async () => db.$client.close());

test("the list keeps open runs and uses stored activity instead of the creation time", async () => {
	const rows = await listRuns({ project: projectId });
	expect(rows.map((row) => row.id)).toEqual([flowRun, recentActivityRun, freshRun, openRun]);
	expect(rows.find((row) => row.id === recentActivityRun)?.activityAt).toBe(hoursAgo(1.5));
});

test("the session history keeps every pin plus the requested count of normal rows", async () => {
	const rows = await listRuns({ project: projectId, includePinnedHistory: true, limit: 1 });
	expect(rows.map((row) => row.id)).toEqual([oldRun, olderRun, recentActivityRun]);
});

test("the generic list keeps its limit when the pin count meets that limit", async () => {
	const rows = await listRuns({ project: projectId, limit: 1 });
	expect(rows.map((row) => row.id)).toEqual([flowRun]);
});

test("a wider window reaches the runs that closed before it", async () => {
	const rows = await listRuns({ project: projectId, windowHours: 168 });
	expect(rows.map((row) => row.id)).toEqual([flowRun, recentActivityRun, freshRun, oldRun, olderRun, openRun]);
});

test("the limit cuts the answer to the newest rows", async () => {
	const rows = await listRuns({ project: projectId, windowHours: 168, limit: 2 });
	expect(rows.map((row) => row.id)).toEqual([flowRun, recentActivityRun]);
});

test("a run named by its id comes back whatever its age", async () => {
	const rows = await listRuns({ ids: [olderRun] });
	expect(rows.map((row) => row.id)).toEqual([olderRun]);
});

test("no list row carries the instruction", async () => {
	const rows = await listRuns({ project: projectId, windowHours: 168 });
	for (const row of rows) expect(row).not.toHaveProperty("instruction");
});

test("a run read with its instruction loses it before it leaves the server", async () => {
	const stored = await run((tx) => getRun(tx, openRun));
	expect(stored.instruction).toBe("Open prompt.");
	expect(projectRun(stored, [])).not.toHaveProperty("instruction");
});

test("stored process activity survives a missing runtime record", async () => {
	await run((tx) => storeObservedActivity(tx, [{ id: openRun, activityAt: hoursAgo(1) }]));
	await run((tx) => storeObservedActivity(tx, [{ id: openRun, activityAt: hoursAgo(2) }]));
	const stored = await run((tx) => getRun(tx, openRun));

	expect(projectRun(stored, []).activityAt).toBe(hoursAgo(1));
});
