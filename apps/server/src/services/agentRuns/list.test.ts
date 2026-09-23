import { afterAll, beforeAll, expect, test } from "bun:test";
import { AgentRunListInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { list } from "./list.ts";
import { projectRun } from "./liveState.ts";
import { getRun, openAgentRuns } from "./queries.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const projectId = ulid();
const agentProjectId = ulid();
const now = new Date("2026-09-23T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const openRun = ulid();
const openAgent = ulid();
const oldOpenAgent = ulid();
const freshRun = ulid();
const oldRun = ulid();
const olderRun = ulid();
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const listRuns = (input: { project?: string; ids?: string[]; limit?: number; windowHours?: number }) =>
	run((tx) => list(ctx, tx, AgentRunListInputSchema.parse(input)));

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES
		(${projectId}, 'LST', 'list', 'List', ${hoursAgo(300)}, ${hoursAgo(300)}),
		(${agentProjectId}, 'AGT', 'agents', 'Agents', ${hoursAgo(300)}, ${hoursAgo(300)})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, closed_at, created_at, updated_at) VALUES
		(${openRun}, 'open', 'session', 'Open prompt.', ${projectId}, 'LST', NULL, ${hoursAgo(200)}, ${hoursAgo(200)}),
		(${freshRun}, 'fresh', 'session', 'Fresh prompt.', ${projectId}, 'LST', ${hoursAgo(2)}, ${hoursAgo(3)}, ${hoursAgo(2)}),
		(${oldRun}, 'old', 'session', 'Old prompt.', ${projectId}, 'LST', ${hoursAgo(40)}, ${hoursAgo(48)}, ${hoursAgo(40)}),
		(${olderRun}, 'older', 'session', 'Older prompt.', ${projectId}, 'LST', ${hoursAgo(100)}, ${hoursAgo(120)}, ${hoursAgo(100)}),
		(${openAgent}, 'agent', 'agent', 'Agent prompt.', ${agentProjectId}, 'AGT', NULL, ${hoursAgo(5)}, ${hoursAgo(5)}),
		(${oldOpenAgent}, 'old agent', 'agent', 'Old agent prompt.', ${agentProjectId}, 'AGT', NULL, ${hoursAgo(250)}, ${hoursAgo(250)})`);
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

test("the list keeps the open runs and the runs that started inside the window", async () => {
	const rows = await listRuns({ project: projectId });
	expect(rows.map((row) => row.id)).toEqual([openRun, freshRun]);
});

test("a wider window reaches the runs that closed before it", async () => {
	const rows = await listRuns({ project: projectId, windowHours: 168 });
	expect(rows.map((row) => row.id)).toEqual([openRun, freshRun, oldRun, olderRun]);
});

// An open run is older than a day of closed runs, so a sort by age alone
// would drop the live agent that the session list must draw.
test("the limit drops the oldest closed run and keeps the open run", async () => {
	const rows = await listRuns({ project: projectId, windowHours: 168, limit: 2 });
	expect(rows.map((row) => row.id)).toEqual([openRun, freshRun]);
});

test("the limit keeps every open run before it takes any closed run", async () => {
	const rows = await listRuns({ project: projectId, windowHours: 168, limit: 1 });
	expect(rows.map((row) => row.id)).toEqual([openRun]);
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

// The statistics fault names the oldest run of this set, so a bound that
// drops the oldest rows would change the answer it gives.
test("the open agent runs carry no bound and no window", async () => {
	const rows = await run(openAgentRuns);
	expect(rows.map((row) => row.id)).toEqual([openAgent, oldOpenAgent]);
});

test("the open agent runs leave out a closed run and a session run", async () => {
	const rows = await run(openAgentRuns);
	expect(rows.map((row) => row.id)).not.toContain(openRun);
	expect(rows.map((row) => row.id)).not.toContain(oldRun);
});
