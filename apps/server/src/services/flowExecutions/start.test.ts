import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { create as createFlow } from "../flows/flows.ts";
import { create as createTicket } from "../tickets/create.ts";
import { start } from "./start.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const oneId = ulid();
const twoId = ulid();
const at = "2026-09-22T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

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

test("a flow of another project cannot run on this ticket", async () => {
	const flow = await run((tx) => createFlow(ctx, tx, { name: "Two review", project: "TWO" }));
	const ticket = await run((tx) => createTicket(ctx, tx, { project: "ONE", title: "Work in project one" }));

	await expect(
		run((tx) =>
			start(ctx, tx, {
				flow: flow.slug,
				ticket: ticket.identifier,
				requestId: crypto.randomUUID(),
				expectedVersion: flow.version,
			}),
		),
	).rejects.toThrow("The flow belongs to another project.");
});
