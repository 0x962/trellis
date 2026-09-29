import { afterAll, beforeAll, expect, test } from "bun:test";
import type { FlowEdgeInput } from "@trellis/api/schemas";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create as createTicket } from "../tickets/create.ts";
import { create, list, update } from "./flows.ts";
import { save } from "./save.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const oneId = ulid();
const twoId = ulid();
const childId = ulid();
const at = "2026-09-22T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const longSlug = (seed: number) => {
	let state = seed;
	return Array.from({ length: 12_000 }, () => {
		state = (state * 48_271) % 2_147_483_647;
		return "abcdefghijklmnopqrstuvwxyz0123456789"[state % 36]!;
	}).join("");
};

const addProject = async (id: string, key: string, slug: string) => {
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${slug}, ${slug}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${id}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
};

beforeAll(async () => {
	db = await openTestDb();
	await addProject(oneId, "ONE", "one");
	await addProject(twoId, "TWO", "two");
	await addProject(childId, "WEB", "web");
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "agent", name: "Test" },
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

const slugs = (flows: { slug: string }[]) => flows.map((flow) => flow.slug).sort();

test("a flow stores the project it belongs to, and null for every project", async () => {
	const scoped = await run((tx) => create(ctx, tx, { name: "One review", project: "ONE" }));
	const everywhere = await run((tx) => create(ctx, tx, { name: "Every review" }));

	expect(scoped.project).toBe("ONE");
	expect(everywhere.project).toBeNull();
});

test("a ticket asks for the flows of its project and for the flows of every project", async () => {
	await run((tx) => create(ctx, tx, { name: "Two review", project: "TWO" }));
	const ticket = await run((tx) => createTicket(ctx, tx, { project: "TWO", title: "Scope the flow check" }));

	const asked = await run((tx) => list(ctx, tx, { ticket: ticket.identifier }));

	expect(slugs(asked)).toEqual(["every-review", "two-review"]);
});

test("a list without a ticket holds every flow of the server", async () => {
	const all = await run((tx) => list(ctx, tx, {}));

	expect(slugs(all)).toEqual(["every-review", "one-review", "two-review"]);
});

test("an update gives a flow to one project, and null gives it back to every project", async () => {
	const flow = await run((tx) => create(ctx, tx, { name: "Moved review" }));

	const scoped = await run((tx) => update(ctx, tx, { flow: flow.id, project: "TWO" }));
	const everywhere = await run((tx) => update(ctx, tx, { flow: flow.id, project: null }));

	expect(scoped.project).toBe("TWO");
	expect(everywhere.project).toBeNull();
});

test("an update that names no project keeps the project of the flow", async () => {
	const flow = await run((tx) => create(ctx, tx, { name: "Kept review", project: "ONE" }));

	const renamed = await run((tx) => update(ctx, tx, { flow: flow.id, name: "Kept review, renamed" }));

	expect(renamed.project).toBe("ONE");
});

test("stores text and a long derived slug above the former limits", async () => {
	const name = longSlug(1);
	const description = "d".repeat(2001);
	const briefing = "b".repeat(200_001);
	const flow = await run((tx) => create(ctx, tx, { name, description }));
	const saved = await run((tx) => update(ctx, tx, { flow: flow.id, briefing }));
	const next = await run((tx) => create(ctx, tx, { name }));

	expect(saved.name).toBe(name);
	expect(saved.slug).toBe(name);
	expect(saved.description).toBe(description);
	expect(saved.briefing).toBe(briefing);
	expect(next.slug).toBe(`${name}-2`);
});

test("stores a long explicit slug and rejects a duplicate", async () => {
	const slug = longSlug(2);
	const saved = await run((tx) => create(ctx, tx, { name: "Long explicit slug", slug }));

	expect(saved.slug).toBe(slug);
	await expect(run((tx) => create(ctx, tx, { name: "Duplicate explicit slug", slug }))).rejects.toMatchObject({
		code: "DUPLICATE",
		data: { field: "slug" },
	});
});

test("stores graph counts and node values above the former limits", async () => {
	const flow = await run((tx) => create(ctx, tx, { name: `Large graph ${ulid()}` }));
	const nodes = Array.from({ length: 501 }, (_, index) => ({
		id: ulid(),
		parentId: null,
		kind: index === 0 ? ("group" as const) : index === 1 ? ("loop" as const) : ("agent" as const),
		title: index === 0 ? "t".repeat(121) : `Step ${index}`,
		instruction: index === 1 ? "i".repeat(200_001) : "Do the work.",
		parallel: false,
		minutes: index === 0 ? 1441 : null,
		maxRounds: index === 1 ? 51 : null,
		x: index === 0 ? 1_000_001 : index,
		y: index === 0 ? -1_000_001 : index,
		width: index === 0 ? 100_001 : null,
		height: index === 0 ? 100_001 : null,
		harness: null,
	}));
	const edges: FlowEdgeInput[] = [];
	for (let from = 0; from < 65 && edges.length < 2001; from++)
		for (let to = from + 1; to < 65 && edges.length < 2001; to++)
			edges.push({ id: ulid(), fromNodeId: nodes[from]!.id, toNodeId: nodes[to]!.id, branch: "out" as const });

	const doc = await run((tx) => save(ctx, tx, { flow: flow.id, expectedVersion: flow.version, nodes, edges }));
	expect(doc.nodes).toHaveLength(501);
	expect(doc.edges).toHaveLength(2001);
	expect(doc.nodes.find((node) => node.id === nodes[0]!.id)).toMatchObject({
		title: "t".repeat(121),
		minutes: 1441,
		x: 1_000_001,
		y: -1_000_001,
		width: 100_001,
		height: 100_001,
	});
	expect(doc.nodes.find((node) => node.id === nodes[1]!.id)).toMatchObject({
		instruction: "i".repeat(200_001),
		maxRounds: 51,
	});
}, 30_000);
