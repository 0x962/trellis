import type { ActorRef, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { cancel } from "../../services/epics/cancel";
import { create, get, list } from "../../services/epics/epics.ts";
import { create as createTicket } from "../../services/tickets/create.ts";
import { createCache } from "../cache.ts";
import { openTestDb } from "../testDb.ts";
import type { Tx } from "../tx.ts";

export async function fixture() {
	const db = await openTestDb();
	const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
	const projectId = ulid();
	const cache = createCache();
	const events: TrellisEvent[] = [];
	let clock = Date.parse("2026-09-30T04:00:00Z");
	const ctx = (actor: ActorRef | null = { kind: "human", name: "Planner" }): ServiceCtx => ({
		actor,
		session: null,
		reqId: ulid(),
		now: new Date(clock++),
		cache,
		actorCache: new Map(),
		emit: (event) => {
			events.push(event);
		},
		dropBlobs: () => {},
		publicUrl: "http://localhost",
	});
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'CAN', 'can', 'Cancellation', ${ctx().now}, ${ctx().now})`);
	for (const [position, category] of ["todo", "started", "review", "done", "canceled"].entries()) {
		const name = category === "canceled" ? "Abandoned" : category;
		await db.execute(sql`INSERT INTO statuses
			(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
			VALUES (${ulid()}, ${projectId}, ${name}, ${name.toLowerCase()}, ${category}, 'fg-muted',
				${position}, ${position === 0}, ${ctx().now}, ${ctx().now})`);
	}
	await run((tx) => cache.rebuild(tx));
	return {
		db,
		run,
		ctx,
		cache,
		events,
		projectId,
		create: (name: string) => run((tx) => create(ctx(), tx, { project: "CAN", name })),
		get: (epic: string) => run((tx) => get(ctx(), tx, { epic })),
		list: () => run((tx) => list(ctx(), tx, { project: "CAN" })),
		cancel: (epic: string, context = ctx()) => run((tx) => cancel(context, tx, { epic })),
		ticket: (epic: string, category = "todo", parent?: string) =>
			run((tx) =>
				createTicket(ctx(), tx, {
					project: "CAN",
					epic,
					title: category,
					status: `category:${category}`,
					parent,
				}),
			),
	};
}
