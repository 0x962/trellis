import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { node } from "../../../agents/nativeFlow/testDoc.ts";
import type { ServiceCtx } from "../../../context.ts";
import { createCache } from "../../../db/cache.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { Tx } from "../../../db/tx.ts";
import { create as createFlow } from "../../flows/flows.ts";
import { save as saveFlow } from "../../flows/save.ts";
import { ensurePr } from "../../reviews/queries.ts";
import { create as createTicket } from "../../tickets/create.ts";
import { start } from "../start.ts";

export async function testFixture() {
	const db = await openTestDb();
	const oneId = ulid();
	const at = "2026-09-22T10:00:00Z";
	const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

	const addProject = async (id: string, key: string, slug: string) => {
		await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${slug}, ${slug}, ${at}, ${at})`);
		await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${id}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	};

	await addProject(oneId, "ONE", "one");
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	const ctx: ServiceCtx = {
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

	const createExecution = async () => {
		const flow = await run((tx) => createFlow(ctx, tx, { name: `Review ${ulid()}`, project: "ONE" }));
		const doc = await run((tx) =>
			saveFlow(ctx, tx, {
				flow: flow.id,
				expectedVersion: flow.version,
				nodes: [node(ulid(), "agent", null)],
				edges: [],
			}),
		);
		const ticket = await run((tx) => createTicket(ctx, tx, { project: "ONE", title: "Review this change" }));
		const diff = await run((tx) => ensurePr(tx, `example/app#${ticket.number}`));
		await db.execute(
			sql`INSERT INTO ticket_pull_requests (ticket_id,pull_request_id,source,actor_name,actor_kind,created_at) VALUES (${ticket.id},${diff.id},'manual','Test','agent',${at})`,
		);
		const input = {
			flow: flow.id,
			ticket: ticket.id,
			diffId: diff.id,
			headSha: "first",
			expectedVersion: doc.flow.version,
		};
		const create = (actor = "Test") =>
			run((tx) =>
				start({ ...ctx, actor: { kind: "agent", name: actor } }, tx, { ...input, requestId: crypto.randomUUID() }),
			);
		return { input, create };
	};

	return { db, ctx, run, createExecution };
}
