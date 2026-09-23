import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create as createTicket } from "../tickets/create.ts";
import { create, list, update } from "./flows.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const oneId = ulid();
const twoId = ulid();
const childId = ulid();
const at = "2026-09-22T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const addProject = async (id: string, rootId: string, parentId: string | null, key: string | null, slug: string) => {
	await db.execute(sql`INSERT INTO projects (id, root_id, parent_id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${rootId}, ${parentId}, ${key}, ${slug}, ${slug}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${id}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
};

beforeAll(async () => {
	db = await openTestDb();
	await addProject(oneId, oneId, null, "ONE", "one");
	await addProject(twoId, twoId, null, "TWO", "two");
	await addProject(childId, oneId, oneId, null, "web");
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

test("a ref to a sub-project is refused, because a flow takes a root project", async () => {
	await expect(run((tx) => create(ctx, tx, { name: "Web review", project: "ONE.web" }))).rejects.toThrow(
		"A flow takes a root project",
	);
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
