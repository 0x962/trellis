import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { get as getBrief } from "../services/brief.ts";
import { create as createComment } from "../services/comments.ts";
import { create as createEpic, get as getEpic, list as listEpics } from "../services/epics/epics.ts";
import { create as createMilestone } from "../services/milestones/milestones.ts";
import { create as createTicket } from "../services/tickets/create.ts";
import { move } from "../services/tickets/move.ts";
import { createCache, type ProjectCache } from "./cache.ts";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import type { Tx } from "./tx.ts";

// One root TST with a todo status, a started status, a human review status,
// and a done status. The epic TST/plan holds the milestones Foundation,
// Surfaces, and Integrate in that order, and the epic TST/flat holds none.
// The services run against an in-memory database with a fixed clock.
let db: Db;
let cache: ProjectCache;
const tst = ulid();
const human: ActorRef = { name: "Test", kind: "human" };
const runId = ulid();
const agent: ActorRef = { name: runId, kind: "agent" };

const insertStatus = (name: string, slug: string, category: string, reviewer: string | null, position: number) =>
	db.execute(sql`INSERT INTO statuses (id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${tst}, ${name}, ${slug}, ${category}, ${reviewer}, 'fg-muted', ${position}, ${position === 0}, '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z')`);

// An agent run of the kind `agent` on the ticket. `closedAt` null is an open run.
const insertRun = (id: string, ticketId: string, closedAt: string | null) =>
	db.execute(sql`INSERT INTO agent_runs (id, name, kind, instruction, project_id, project_path, ticket_id, closed_at, created_at, updated_at)
		VALUES (${id}, 'Builder', 'agent', '', ${tst}, 'TST', ${ticketId}, ${closedAt}, '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z')`);

const ctxAt = (now: string, actor: ActorRef = human): ServiceCtx => ({
	actor,
	session: null,
	reqId: ulid(),
	now: new Date(now),
	cache,
	actorCache: new Map(),
	emit: () => {},
	dropBlobs: () => {},
	publicUrl: "http://localhost:4597",
});

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const ticket = (ctx: ServiceCtx, title: string, milestone: string, status = "todo") =>
	run((tx) => createTicket(ctx, tx, { project: "TST", title, milestone: `TST/plan/${milestone}`, status }));

const next = async (ctx: ServiceCtx) => {
	const epic = await run((tx) => getEpic(ctx, tx, { epic: "TST/plan" }));
	return epic.milestones.map((milestone) => [
		milestone.slug,
		milestone.state,
		milestone.toStart,
		milestone.running,
		milestone.waitsForYou,
	]);
};

beforeAll(async () => {
	db = await openDb(":memory:");
	await migrate(db);
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${tst}, ${tst}, 'TST', 'tst', 'TST', '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z')`);
	await insertStatus("Todo", "todo", "todo", null, 0);
	await insertStatus("In Progress", "in-progress", "started", null, 1);
	await insertStatus("Human Review", "human-review", "review", "human", 2);
	await insertStatus("Done", "done", "done", null, 3);
	cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const ctx = ctxAt("2026-09-18T10:00:30.000Z");
	await run((tx) => createEpic(ctx, tx, { project: "TST", name: "Plan" }));
	await run((tx) => createEpic(ctx, tx, { project: "TST", name: "Flat" }));
	for (const name of ["Foundation", "Surfaces", "Integrate"])
		await run((tx) => createMilestone(ctx, tx, { epic: "TST/plan", name }));
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("an epic names its first open milestone, and an epic with no milestone names none", async () => {
	const ctx = ctxAt("2026-09-18T10:01:00.000Z");
	const foundation = await run((tx) => getEpic(ctx, tx, { epic: "TST/plan" }));
	expect(foundation).toMatchObject({
		currentMilestone: { ref: "TST/plan/foundation", name: "Foundation" },
		currentMilestoneIndex: 1,
		milestoneCount: 3,
	});
	await ticket(ctx, "Server: the table", "foundation", "done");
	await ticket(ctx, "Web: the page", "surfaces");
	const listed = await run((tx) => listEpics(ctx, tx, { project: "TST" }));
	expect(
		listed.map((epic) => [
			epic.ref,
			epic.currentMilestone?.ref ?? null,
			epic.currentMilestoneIndex,
			epic.milestoneCount,
		]),
	).toEqual([
		["TST/flat", null, null, 0],
		["TST/plan", "TST/plan/surfaces", 2, 3],
	]);
});

test("a milestone counts the tickets to start, the running tickets, and the tickets that wait for the person", async () => {
	const ctx = ctxAt("2026-09-18T10:02:00.000Z");
	const running = await ticket(ctx, "CLI: the command", "surfaces");
	const stopped = await ticket(ctx, "Docs: the page", "surfaces");
	await ticket(ctx, "Decide the name", "surfaces", "human-review");
	const started = await ticket(ctx, "Mobile: the screen", "surfaces", "in-progress");
	await insertRun(runId, running.id, null);
	await insertRun(ulid(), stopped.id, "2026-09-18T10:01:30.000Z");
	await insertRun(ulid(), started.id, null);
	expect(await next(ctx)).toEqual([
		["foundation", "done", 0, 0, 0],
		["surfaces", "open", 2, 2, 1],
		["integrate", "open", 0, 0, 0],
	]);
});

test("the brief of a ticket prints the done tickets of the earlier milestones with the last agent comment", async () => {
	const ctx = ctxAt("2026-09-18T10:03:00.000Z");
	await run((tx) => createComment(ctxAt("2026-09-18T10:03:00.000Z", agent), tx, { ticket: "TST-1", body: "First." }));
	await run((tx) =>
		createComment(ctxAt("2026-09-18T10:03:10.000Z", agent), tx, {
			ticket: "TST-1",
			body: "The table is in 0080.\nRun: bun test",
		}),
	);
	await run((tx) => createComment(ctxAt("2026-09-18T10:03:20.000Z"), tx, { ticket: "TST-1", body: "Thanks." }));
	await run((tx) => move(ctx, tx, { ticket: "TST-2", status: "done" }));
	const merge = await ticket(ctx, "Merge the fronts", "integrate");
	const brief = await run((tx) => getBrief(ctx, tx, { ticket: merge.identifier }));
	expect(brief.markdown).toContain(
		[
			"## Results of earlier milestones",
			"",
			"### Foundation",
			"",
			"- TST-1 Server: the table",
			"  The table is in 0080.",
			"  Run: bun test",
			"",
			"### Surfaces",
			"",
			"- TST-2 Web: the page",
		].join("\n"),
	);
	const first = await run((tx) => getBrief(ctx, tx, { ticket: "TST-1" }));
	expect(first.markdown).not.toContain("## Results of earlier milestones");
});
