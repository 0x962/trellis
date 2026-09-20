import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache, type ProjectCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create as createEpic } from "../epics/epics.ts";
import { create } from "./create.ts";
import { importDependencies } from "./importDeps.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let cache: ProjectCache;
const rootId = ulid();
const actor: ActorRef = { kind: "human", name: "Test" };

const ctxAt = (now: string): ServiceCtx => ({
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

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, ${rootId}, 'TST', 'tst', 'Test', '2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z')`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${rootId}, 'Todo', 'todo', 'todo', NULL, 'fg-muted', 0, true,
			'2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z')`);
	cache = createCache();
	await run((tx) => cache.rebuild(tx));
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("the import writes parsed edges once and reports the ticket with each unresolved reference", async () => {
	const ctx = ctxAt("2026-09-20T10:01:00.000Z");
	await run((tx) => createEpic(ctx, tx, { project: "TST", name: "First epic" }));
	await run((tx) => createEpic(ctx, tx, { project: "TST", name: "Other epic" }));
	const first = await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "First",
			epic: "TST/first-epic",
			description: "Step 1 of the routine runtime.",
		}),
	);
	const second = await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "Second",
			epic: "TST/first-epic",
			description: "Step 2 of the routine runtime.\n\nDepends on: steps 1, 99.",
		}),
	);
	const question = await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "Question",
			epic: "TST/first-epic",
			description: "Waiting on this answer: TST-1, TST-2, and TST-4.",
		}),
	);
	await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "Outside",
			epic: "TST/other-epic",
		}),
	);
	await db.execute(sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at) VALUES
		(${second.id}, ${first.id}, 'manual', ${ctx.now}),
		(${second.id}, ${question.id}, 'derived', ${ctx.now})`);

	const imported = await run((tx) => importDependencies(ctx, tx, { epic: "TST/first-epic" }));
	expect(imported).toEqual({ edgeCount: 2, ticketsWithUnresolvedReferences: ["TST-2", "TST-3"] });
	const edges = await db.execute(
		sql`SELECT d.ticket_id, d.depends_on_id, d.source FROM ticket_deps d
			JOIN tickets target ON target.id = d.ticket_id
			JOIN tickets dependency ON dependency.id = d.depends_on_id
			ORDER BY target.number, dependency.number`,
	);
	expect(edges.rows).toEqual([
		{ ticket_id: first.id, depends_on_id: question.id, source: "parsed" },
		{ ticket_id: second.id, depends_on_id: first.id, source: "manual" },
		{ ticket_id: second.id, depends_on_id: question.id, source: "parsed" },
	]);

	const repeated = await run((tx) => importDependencies(ctx, tx, { epic: "TST/first-epic" }));
	expect(repeated).toEqual({ edgeCount: 0, ticketsWithUnresolvedReferences: ["TST-2", "TST-3"] });
});

test("the import reads a ticket identifier from the Depends on line", async () => {
	const ctx = ctxAt("2026-09-20T10:02:00.000Z");
	await run((tx) => createEpic(ctx, tx, { project: "TST", name: "Identifier refs" }));
	const firstDependency = await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "First dependency",
			epic: "TST/identifier-refs",
		}),
	);
	const secondDependency = await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "Second dependency",
			epic: "TST/identifier-refs",
		}),
	);
	const target = await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "Target",
			epic: "TST/identifier-refs",
			description: `Depends on: ${firstDependency.identifier}, ${secondDependency.identifier}.`,
		}),
	);

	expect(await run((tx) => importDependencies(ctx, tx, { epic: "TST/identifier-refs" }))).toEqual({
		edgeCount: 2,
		ticketsWithUnresolvedReferences: [],
	});
	const edges = await db.execute(sql`SELECT d.depends_on_id, d.source FROM ticket_deps d
		JOIN tickets dependency ON dependency.id = d.depends_on_id
		WHERE d.ticket_id = ${target.id} ORDER BY dependency.number`);
	expect(edges.rows).toEqual([
		{ depends_on_id: firstDependency.id, source: "parsed" },
		{ depends_on_id: secondDependency.id, source: "parsed" },
	]);
});

test("the step map reads a numbered step without epic-specific words", async () => {
	const ctx = ctxAt("2026-09-20T10:03:00.000Z");
	await run((tx) => createEpic(ctx, tx, { project: "TST", name: "Generic steps" }));
	const dependency = await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "Dependency",
			epic: "TST/generic-steps",
			description: "Step 7: Prepare the data.",
		}),
	);
	const target = await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "Target",
			epic: "TST/generic-steps",
			description: "Depends on: step 7.",
		}),
	);

	expect(await run((tx) => importDependencies(ctx, tx, { epic: "TST/generic-steps" }))).toEqual({
		edgeCount: 1,
		ticketsWithUnresolvedReferences: [],
	});
	const edges = await db.execute(sql`SELECT source FROM ticket_deps
		WHERE ticket_id = ${target.id} AND depends_on_id = ${dependency.id}`);
	expect(edges.rows).toEqual([{ source: "parsed" }]);
});

test("the import reports the ticket whose description would close a cycle", async () => {
	const ctx = ctxAt("2026-09-20T10:04:00.000Z");
	await run((tx) => createEpic(ctx, tx, { project: "TST", name: "Cycle" }));
	const first = await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "First",
			epic: "TST/cycle",
			description: "Step 1.\n\nDepends on: step 2.",
		}),
	);
	const second = await run((tx) =>
		create(ctx, tx, {
			project: "TST",
			title: "Second",
			epic: "TST/cycle",
			description: "Step 2.\n\nDepends on: step 1.",
		}),
	);

	expect(await run((tx) => importDependencies(ctx, tx, { epic: "TST/cycle" }))).toEqual({
		edgeCount: 1,
		ticketsWithUnresolvedReferences: [second.identifier],
	});
	const edges = await db.execute(sql`SELECT ticket_id, depends_on_id, source FROM ticket_deps
		WHERE ticket_id IN (${first.id}, ${second.id})`);
	expect(edges.rows).toEqual([{ ticket_id: first.id, depends_on_id: second.id, source: "parsed" }]);
});
