import { afterAll, beforeAll, expect, test } from "bun:test";
import { AgentRunListInputSchema, AgentWorkspaceLineStatsInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { recordObservedActivity } from "./activity.ts";
import { latestByEpicTicket, list } from "./list.ts";
import { projectRun } from "./liveState.ts";
import { getRun } from "./queries.ts";

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
const bulkProjectId = ulid();
const stableProjectId = ulid();
const epicProjectId = ulid();
const statusId = ulid();
const epicId = ulid();
const epicTicketIds = [ulid(), ulid()];
const epicRunIds = {
	assigned: ulid(),
	closedAfterAssigned: ulid(),
	closedWithLateAttempt: ulid(),
	closedLater: ulid(),
};
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const listRuns = (input: {
	project?: string;
	ids?: string[];
	assigned?: boolean;
	includePinnedHistory?: boolean;
	allHistory?: boolean;
	limit?: number;
	windowHours?: number;
	cursor?: string;
}) => run((tx) => list(ctx, tx, AgentRunListInputSchema.parse(input)));

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES
		(${projectId}, 'LST', 'list', 'List', ${hoursAgo(300)}, ${hoursAgo(300)}),
		(${bulkProjectId}, 'BLK', 'bulk', 'Bulk', ${hoursAgo(300)}, ${hoursAgo(300)}),
		(${stableProjectId}, 'STB', 'stable', 'Stable', ${hoursAgo(300)}, ${hoursAgo(300)}),
		(${epicProjectId}, 'EPH', 'epic-history', 'Epic history', ${hoursAgo(300)}, ${hoursAgo(300)})`);
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES ('dana', 'human', ${hoursAgo(300)}, ${hoursAgo(300)})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${epicProjectId}, 'Todo', 'todo', 'todo', 'neutral', 0, true,
			${hoursAgo(300)}, ${hoursAgo(300)})`);
	await db.execute(sql`INSERT INTO epics
		(id, project_id, slug, name, actor_name, actor_kind, created_at, updated_at, actor_id)
		VALUES (${epicId}, ${epicProjectId}, 'history', 'History', 'dana', 'human',
			${hoursAgo(300)}, ${hoursAgo(300)}, (SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY['human', 'dana']::text[]))`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, epic_id, position, created_at, updated_at) VALUES
		(${epicTicketIds[0]}, ${epicProjectId}, 1, 'Assigned', ${statusId}, ${epicId}, 1,
			${hoursAgo(300)}, ${hoursAgo(300)}),
		(${epicTicketIds[1]}, ${epicProjectId}, 2, 'Retried', ${statusId}, ${epicId}, 2,
			${hoursAgo(300)}, ${hoursAgo(300)})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, pinned_at, closed_at, created_at, updated_at) VALUES
		(${openRun}, 'open', 'session', 'Open prompt.', ${projectId}, 'LST', NULL, NULL, ${hoursAgo(200)}, ${hoursAgo(200)}),
		(${freshRun}, 'fresh', 'session', 'Fresh prompt.', ${projectId}, 'LST', NULL, ${hoursAgo(2)}, ${hoursAgo(3)}, ${hoursAgo(2)}),
		(${recentActivityRun}, 'recent activity', 'session', 'Recent prompt.', ${projectId}, 'LST', NULL, ${hoursAgo(40)}, ${hoursAgo(200)}, ${hoursAgo(1.5)}),
		(${oldRun}, 'old', 'session', 'Old prompt.', ${projectId}, 'LST', ${hoursAgo(1)}, ${hoursAgo(40)}, ${hoursAgo(48)}, ${hoursAgo(40)}),
		(${olderRun}, 'older', 'session', 'Older prompt.', ${projectId}, 'LST', ${hoursAgo(2)}, ${hoursAgo(100)}, ${hoursAgo(120)}, ${hoursAgo(100)}),
		(${flowRun}, 'flow', 'flow', 'Review.', ${projectId}, 'LST', NULL, ${hoursAgo(1)}, ${hoursAgo(1)}, ${hoursAgo(1)})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, ticket_id, ticket_identifier,
			closed_at, activity_at, created_at, updated_at) VALUES
		(${epicRunIds.assigned}, 'assigned', 'agent', 'Prompt.', ${epicProjectId}, 'EPH',
			${epicTicketIds[0]}, 'EPH-1', NULL, ${hoursAgo(20)}, ${hoursAgo(20)}, ${hoursAgo(20)}),
		(${epicRunIds.closedAfterAssigned}, 'closed', 'agent', 'Prompt.', ${epicProjectId}, 'EPH',
			${epicTicketIds[0]}, 'EPH-1', ${hoursAgo(1)}, ${hoursAgo(1)}, ${hoursAgo(2)}, ${hoursAgo(1)}),
		(${epicRunIds.closedWithLateAttempt}, 'retried', 'agent', 'Prompt.', ${epicProjectId}, 'EPH',
			${epicTicketIds[1]}, 'EPH-2', ${hoursAgo(10)}, ${hoursAgo(10)}, ${hoursAgo(100)}, ${hoursAgo(10)}),
		(${epicRunIds.closedLater}, 'later', 'agent', 'Prompt.', ${epicProjectId}, 'EPH',
			${epicTicketIds[1]}, 'EPH-2', ${hoursAgo(4)}, ${hoursAgo(4)}, ${hoursAgo(5)}, ${hoursAgo(4)})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, closed_at, created_at, updated_at)
		SELECT '01ARZ3NDEKTSV4RRFFQ69G' || lpad(n::text, 4, '0'), 'bulk-' || n, 'session', 'Prompt.',
			${bulkProjectId}, 'BLK', ${hoursAgo(1)}::timestamptz - n * interval '1 second',
			${hoursAgo(1)}::timestamptz - n * interval '1 second',
			${hoursAgo(1)}::timestamptz - n * interval '1 second'
		FROM generate_series(1, 1005) AS n`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, closed_at, created_at, updated_at)
		SELECT '01BRZ3NDEKTSV4RRFFQ69G' || lpad(n::text, 4, '0'), 'stable-' || n, 'session', 'Prompt.',
			${stableProjectId}, 'STB', ${hoursAgo(1)}::timestamptz - n * interval '1 second',
			${hoursAgo(1)}::timestamptz - n * interval '1 second',
			${hoursAgo(1)}::timestamptz - n * interval '1 second'
		FROM generate_series(1, 5) AS n`);
	await db.execute(sql`INSERT INTO agent_execution_attempts (id, run_id, generation, token_hash, created_at)
		VALUES
		(${ulid()}, ${recentActivityRun}, 1, 'hash', ${hoursAgo(1.5)}),
		(${ulid()}, ${epicRunIds.closedWithLateAttempt}, 1, 'hash', ${hoursAgo(1)})`);
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
	const rows = (await listRuns({ project: projectId })).items;
	expect(rows.map((row) => row.id)).toEqual([flowRun, recentActivityRun, freshRun, openRun]);
	expect(rows.find((row) => row.id === recentActivityRun)?.activityAt).toBe(hoursAgo(1.5));
});

test("the session history pages through pinned and normal rows", async () => {
	const first = await listRuns({ project: projectId, includePinnedHistory: true, limit: 1 });
	const second = await listRuns({
		project: projectId,
		includePinnedHistory: true,
		limit: 1,
		cursor: first.nextCursor!,
	});
	expect(first.items.map((row) => row.id)).toEqual([oldRun]);
	expect(second.items.map((row) => row.id)).toEqual([olderRun]);
	expect(second.nextCursor).not.toBeNull();
});

test("the generic list keeps its limit when the pin count meets that limit", async () => {
	const rows = (await listRuns({ project: projectId, limit: 1 })).items;
	expect(rows.map((row) => row.id)).toEqual([flowRun]);
});

test("a wider window reaches the runs that closed before it", async () => {
	const rows = (await listRuns({ project: projectId, windowHours: 168 })).items;
	expect(rows.map((row) => row.id)).toEqual([flowRun, recentActivityRun, freshRun, oldRun, olderRun, openRun]);
});

test("the limit cuts the answer to the newest rows", async () => {
	const rows = (await listRuns({ project: projectId, windowHours: 168, limit: 2 })).items;
	expect(rows.map((row) => row.id)).toEqual([flowRun, recentActivityRun]);
});

test("a run named by its id comes back whatever its age", async () => {
	const rows = (await listRuns({ ids: [olderRun] })).items;
	expect(rows.map((row) => row.id)).toEqual([olderRun]);
});

test("no list row carries the instruction", async () => {
	const rows = (await listRuns({ project: projectId, windowHours: 168 })).items;
	for (const row of rows) expect(row).not.toHaveProperty("instruction");
});

test("a run read with its instruction loses it before it leaves the server", async () => {
	const stored = await run((tx) => getRun(tx, openRun));
	expect(stored.instruction).toBe("Open prompt.");
	expect(projectRun(stored, [])).not.toHaveProperty("instruction");
});

test("stored process activity survives a missing runtime record", async () => {
	await run((tx) => recordObservedActivity(ctx, tx, [{ id: openRun, activityAt: hoursAgo(1) }]));
	await run((tx) => recordObservedActivity(ctx, tx, [{ id: openRun, activityAt: hoursAgo(2) }]));
	const stored = await run((tx) => getRun(tx, openRun));

	expect(projectRun(stored, []).activityAt).toBe(hoursAgo(1));
});

test("the indexed lookup keeps the latest switch and ignores later requests without a switch", async () => {
	await db.execute(sql`INSERT INTO agent_start_requests (request_id, actor_name, actor_kind, run_id, target, created_at)
		SELECT 'noise-' || n, 'dana', 'human', ${oldRun}, jsonb_build_object('switchedTo', 'other'), ${hoursAgo(4)}
		FROM generate_series(1, 2000) AS n`);
	await db.execute(sql`INSERT INTO agent_start_requests (request_id, actor_name, actor_kind, run_id, target, created_at) VALUES
		('switch-old', 'dana', 'human', ${openRun}, '{"switchedTo":"first"}', ${hoursAgo(3)}),
		('switch-new', 'dana', 'human', ${openRun}, '{"switchedTo":"second"}', ${hoursAgo(2)}),
		('resume', 'dana', 'human', ${openRun}, '{}', ${hoursAgo(1)})`);
	await db.execute(sql`ANALYZE agent_start_requests`);
	const rows = (await listRuns({ ids: [openRun, freshRun] })).items;
	expect(rows.find((row) => row.id === openRun)?.switchedTo).toBe("second");
	expect(rows.find((row) => row.id === freshRun)?.switchedTo).toBeNull();
	const plan = await db.execute(sql`EXPLAIN (FORMAT JSON)
		SELECT target->>'switchedTo' FROM agent_start_requests
		WHERE run_id = ${openRun} AND target->>'switchedTo' IS NOT NULL
		ORDER BY created_at DESC LIMIT 1`);
	expect(JSON.stringify(plan.rows)).toContain("agent_start_requests_latest_switch_idx");
});

test("the cursor reads more than 1000 run ids without a duplicate or a missing row", async () => {
	const ids = Array.from({ length: 1005 }, (_, index) => `01ARZ3NDEKTSV4RRFFQ69G${String(index + 1).padStart(4, "0")}`);
	const found: string[] = [];
	let cursor: string | undefined;
	do {
		const page = await listRuns({ ids, limit: 200, cursor });
		found.push(...page.items.map((row) => row.id));
		cursor = page.nextCursor ?? undefined;
	} while (cursor !== undefined);

	expect(found).toHaveLength(1005);
	expect(new Set(found).size).toBe(1005);
	expect(new Set(found)).toEqual(new Set(ids));
});

test("a new run does not change the remaining cursor pages", async () => {
	const first = await listRuns({ project: stableProjectId, allHistory: true, limit: 2 });
	const newRun = ulid();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, closed_at, created_at, updated_at) VALUES
		(${newRun}, 'new', 'session', 'Prompt.', ${stableProjectId}, 'STB', ${now}, ${now}, ${now})`);
	const remaining: string[] = [];
	let cursor = first.nextCursor ?? undefined;
	while (cursor !== undefined) {
		const page = await listRuns({ project: stableProjectId, allHistory: true, limit: 2, cursor });
		remaining.push(...page.items.map((row) => row.id));
		cursor = page.nextCursor ?? undefined;
	}

	const expected = Array.from(
		{ length: 5 },
		(_, index) => `01BRZ3NDEKTSV4RRFFQ69G${String(index + 1).padStart(4, "0")}`,
	);
	expect([...first.items.map((row) => row.id), ...remaining]).toEqual(expected);
	expect(remaining).not.toContain(newRun);
});

test("the input accepts complete filters and an all-history request", () => {
	const ids = Array.from({ length: 1001 }, () => ulid());
	expect(AgentRunListInputSchema.parse({ ids, allHistory: true })).toMatchObject({ ids, allHistory: true });
	expect(AgentWorkspaceLineStatsInputSchema.parse({ ticketIds: ids }).ticketIds).toHaveLength(1001);
});

test("an invalid or mismatched cursor fails", async () => {
	await expect(listRuns({ cursor: "invalid" })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
	const first = await listRuns({ project: stableProjectId, limit: 1 });
	await expect(listRuns({ project: bulkProjectId, limit: 1, cursor: first.nextCursor! })).rejects.toMatchObject({
		code: "INVALID_CURSOR",
	});
});

test("the epic query returns the latest useful agent run for each ticket", async () => {
	const found = await run((tx) => latestByEpicTicket(ctx, tx, { epic: "EPH/history" }));
	expect(found.map((item) => item.id)).toEqual([epicRunIds.closedAfterAssigned, epicRunIds.closedWithLateAttempt]);
});
