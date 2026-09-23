import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { list } from "../agentRuns/agentRuns.ts";
import { getRun } from "../agentRuns/queries.ts";
import { move } from "./move.ts";
import { getSession } from "./queries.ts";
import { rename } from "./rename.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const rootId = ulid();
const childId = ulid();
const rootTicketId = ulid();
const childTicketId = ulid();
const rootSessionId = ulid();
const childSessionId = ulid();
const moveSessionId = ulid();
const detachSessionId = ulid();
const nameMoveSessionId = ulid();
const runMoveSessionId = ulid();
const duplicateOneRunId = ulid();
const duplicateTwoRunId = ulid();
const ambiguityRunId = ulid();
const ambiguityOtherRunId = ulid();
const rootSessionRowId = ulid();
const childSessionRowId = ulid();
const moveSessionRowId = ulid();
const detachSessionRowId = ulid();
const nameMoveSessionRowId = ulid();
const runMoveSessionRowId = ulid();
const duplicateOneRowId = ulid();
const duplicateTwoRowId = ulid();
const ambiguitySessionRowId = ulid();
const ambiguitySessionRef = ambiguityRunId;
const ticketSessionRowId = ulid();
const rootTicketRunId = ulid();
const childTicketRunId = ulid();
const at = "2026-09-21T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES
		(${rootId}, 'SCP', 'scope', 'Scope', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES
		(${childId}, 'CHD', 'child', 'Child', ${at}, ${at})`);
	const statusId = ulid();
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at) VALUES
		(${statusId}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at) VALUES
		(${rootTicketId}, ${rootId}, 1, 'Root task', ${statusId}, 0, ${at}, ${at}),
		(${childTicketId}, ${childId}, 1, 'Child task', ${statusId}, 0, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, ticket_id, ticket_identifier, created_at, updated_at) VALUES
		(${rootSessionId}, 'root-session', 'session', 'Root', ${rootId}, 'SCP', NULL, NULL, ${at}, ${at}),
		(${childSessionId}, 'child-session', 'session', 'Child', ${childId}, 'CHD', NULL, NULL, ${at}, ${at}),
		(${moveSessionId}, 'move-session', 'session', 'Move', ${rootId}, 'SCP', NULL, NULL, ${at}, ${at}),
		(${detachSessionId}, 'detach-session', 'session', 'Detach', ${childId}, 'CHD', NULL, NULL, ${at}, ${at}),
		(${nameMoveSessionId}, 'name-move-session', 'session', 'Name move', ${rootId}, 'SCP', NULL, NULL, ${at}, ${at}),
		(${runMoveSessionId}, 'run-move-session', 'session', 'Run move', ${rootId}, 'SCP', NULL, NULL, ${at}, ${at}),
		(${duplicateOneRunId}, 'duplicate-one', 'session', 'Duplicate one', ${rootId}, 'SCP', NULL, NULL, ${at}, ${at}),
		(${duplicateTwoRunId}, 'duplicate-two', 'session', 'Duplicate two', ${rootId}, 'SCP', NULL, NULL, ${at}, ${at}),
		(${ambiguityRunId}, 'ambiguous-run', 'session', 'Ambiguous run', ${rootId}, 'SCP', NULL, NULL, ${at}, ${at}),
		(${ambiguityOtherRunId}, 'ambiguous-row', 'session', 'Ambiguous row', ${rootId}, 'SCP', NULL, NULL, ${at}, ${at}),
		(${rootTicketRunId}, 'root-ticket', 'agent', 'Root ticket', ${childId}, 'CHD', ${rootTicketId}, 'SCP-1', ${at}, ${at}),
		(${childTicketRunId}, 'child-ticket', 'agent', 'Child ticket', ${rootId}, 'SCP', ${childTicketId}, 'CHD-1', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at) VALUES
		(${rootSessionRowId}, 'root-session', '/tmp/root-session', '{"preset":"claude"}'::jsonb, ${rootSessionId}, ${at}, ${at}),
		(${childSessionRowId}, 'child-session', '/tmp/child-session', '{"preset":"claude"}'::jsonb, ${childSessionId}, ${at}, ${at}),
		(${moveSessionRowId}, 'move-session', '/tmp/move-session', '{"preset":"claude"}'::jsonb, ${moveSessionId}, ${at}, ${at}),
		(${detachSessionRowId}, 'detach-session', '/tmp/detach-session', '{"preset":"claude"}'::jsonb, ${detachSessionId}, ${at}, ${at}),
		(${nameMoveSessionRowId}, 'name-move-session', '/tmp/name-move-session', '{"preset":"claude"}'::jsonb, ${nameMoveSessionId}, ${at}, ${at}),
		(${runMoveSessionRowId}, 'run-move-session', '/tmp/run-move-session', '{"preset":"claude"}'::jsonb, ${runMoveSessionId}, ${at}, ${at}),
		(${duplicateOneRowId}, 'duplicate-one', '/tmp/duplicate-one', '{"preset":"claude"}'::jsonb, ${duplicateOneRunId}, ${at}, ${at}),
		(${duplicateTwoRowId}, 'duplicate-two', '/tmp/duplicate-two', '{"preset":"claude"}'::jsonb, ${duplicateTwoRunId}, ${at}, ${at}),
		(${ambiguitySessionRowId}, 'ambiguous-run', '/tmp/ambiguous-run', '{"preset":"claude"}'::jsonb, ${ambiguityRunId}, ${at}, ${at}),
		(${ambiguitySessionRef}, 'ambiguous-row', '/tmp/ambiguous-row', '{"preset":"claude"}'::jsonb, ${ambiguityOtherRunId}, ${at}, ${at}),
		(${ticketSessionRowId}, 'root-ticket', '/tmp/root-ticket', '{"preset":"claude"}'::jsonb, ${rootTicketRunId}, ${at}, ${at})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "dana" },
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
	expect(rootRuns.map(({ id }) => id).sort()).toEqual(
		[
			rootSessionId,
			moveSessionId,
			nameMoveSessionId,
			runMoveSessionId,
			ambiguityRunId,
			ambiguityOtherRunId,
			duplicateOneRunId,
			duplicateTwoRunId,
			rootTicketRunId,
		].sort(),
	);
	expect(childRuns.map(({ id }) => id).sort()).toEqual([childSessionId, detachSessionId, childTicketRunId].sort());
});

test("a bare session moves to another project", async () => {
	const moved = await run((tx) => move(ctx, tx, { id: moveSessionRowId, project: "CHD" }));
	expect(moved.projectId).toBe(childId);
	expect(moved.projectKey).toBe("CHD");
	const saved = await run((tx) => getSession(tx, moveSessionRowId));
	expect(saved.projectId).toBe(childId);
	expect(saved.projectKey).toBe("CHD");
});

test("a bare session clears its project", async () => {
	const moved = await run((tx) => move(ctx, tx, { id: detachSessionRowId, project: null }));
	expect(moved.projectId).toBeNull();
	expect(moved.projectKey).toBe("");
});

test("a bare session moves by name", async () => {
	const moved = await run((tx) => move(ctx, tx, { id: "name-move-session", project: "CHD" }));
	expect(moved.id).toBe(nameMoveSessionRowId);
	expect(moved.projectId).toBe(childId);
	expect(moved.projectKey).toBe("CHD");
});

test("a bare session moves by agent run id", async () => {
	const moved = await run((tx) => move(ctx, tx, { id: runMoveSessionId, project: "CHD" }));
	expect(moved.id).toBe(runMoveSessionRowId);
	expect(moved.projectId).toBe(childId);
	expect(moved.projectKey).toBe("CHD");
});

test("a session rename stores the typed text in the session and its agent run", async () => {
	const renamed = await run((tx) => rename(ctx, tx, { id: rootSessionRowId, name: "  Display Name  " }));
	expect(renamed.name).toBe("Display Name");
	expect((await run((tx) => getSession(tx, rootSessionRowId))).name).toBe("Display Name");
	expect((await run((tx) => getRun(tx, rootSessionId))).name).toBe("Display Name");
});

test("a session renames by agent run id", async () => {
	const renamed = await run((tx) => rename(ctx, tx, { id: runMoveSessionId, name: "run renamed" }));
	expect(renamed.id).toBe(runMoveSessionRowId);
	expect(renamed.name).toBe("run renamed");
});

test("two sessions hold one name", async () => {
	await run((tx) => rename(ctx, tx, { id: duplicateOneRowId, name: "principal" }));
	await run((tx) => rename(ctx, tx, { id: duplicateTwoRowId, name: "principal" }));
	expect((await run((tx) => getSession(tx, duplicateOneRowId))).name).toBe("principal");
	expect((await run((tx) => getSession(tx, duplicateTwoRowId))).name).toBe("principal");
});

test("a name that fits two sessions lists the matching ids", async () => {
	const matches = [duplicateOneRowId, duplicateTwoRowId].sort().join(", ");
	await expect(run((tx) => rename(ctx, tx, { id: "principal", name: "again" }))).rejects.toThrow(
		`More than one session matches principal. Matching ids: ${matches}.`,
	);
});

test("a session rename keeps the punctuation a person typed", async () => {
	const renamed = await run((tx) => rename(ctx, tx, { id: childSessionRowId, name: " --- " }));
	expect(renamed.name).toBe("---");
});

test("a session rename refuses an empty name", async () => {
	await expect(run((tx) => rename(ctx, tx, { id: childSessionRowId, name: "   " }))).rejects.toThrow("Enter a name.");
});

test("an ambiguous session ref lists the matching ids", async () => {
	const matches = [ambiguitySessionRowId, ambiguitySessionRef].sort().join(", ");
	await expect(run((tx) => move(ctx, tx, { id: ambiguitySessionRef, project: "CHD" }))).rejects.toThrow(
		`More than one session matches ${ambiguitySessionRef}. Matching ids: ${matches}.`,
	);
});

test("a ticket session keeps the project of its ticket", async () => {
	await expect(run((tx) => move(ctx, tx, { id: ticketSessionRowId, project: null }))).rejects.toThrow(
		"A ticket session keeps the project of its ticket.",
	);
});
