import { HarnessSchema, type TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { type ServiceCtx, SYSTEM_ACTOR } from "../../../../../context.ts";
import { createCache } from "../../../../../db/cache.ts";
import { openTestDb } from "../../../../../db/testDb.ts";
import type { Tx } from "../../../../../db/tx.ts";
import type { IoCtx } from "../../../../support.ts";
import { create as createTicket } from "../../../../tickets/create.ts";
import { update } from "../../../../tickets/update.ts";
import { create as createWave } from "../../../../waves/waves.ts";
import { create } from "../../../epics.ts";
import { get } from "../../get";
import { reserveNext } from "../../reserveNext";
import { set } from "../../set";

export const harness = HarnessSchema.parse({ preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" });

export async function fixture() {
	const db = await openTestDb();
	const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
	const projectId = ulid();
	const cache = createCache();
	const events: TrellisEvent[] = [];
	const ctx: ServiceCtx = {
		actor: SYSTEM_ACTOR,
		session: null,
		reqId: ulid(),
		now: new Date(),
		cache,
		actorCache: new Map(),
		emit: (event) => {
			events.push(event);
		},
		dropBlobs: () => {},
		publicUrl: "http://localhost",
	};
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, directory, created_at, updated_at)
		VALUES (${projectId}, 'AUTO', 'auto', 'Autopilot', '/fixture/repository', ${ctx.now}, ${ctx.now})`);
	for (const [position, category] of ["todo", "started", "review", "done", "canceled"].entries()) {
		await db.execute(sql`INSERT INTO statuses
			(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
			VALUES (${ulid()}, ${projectId}, ${category}, ${category}, ${category}, 'fg-muted',
				${position}, ${position === 0}, ${ctx.now}, ${ctx.now})`);
	}
	await run((tx) => cache.rebuild(tx));
	const epic = await run((tx) => create(ctx, tx, { project: "AUTO", name: "Flight" }));
	const wave = await run((tx) => createWave(ctx, tx, { epic: epic.id, name: "First" }));
	const background: Promise<void>[] = [];
	const io: IoCtx = {
		core: ctx,
		actor: SYSTEM_ACTOR,
		session: null,
		home: "/fixture/home",
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		now: () => ctx.now,
		ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		emit: ctx.emit,
		afterCommit: () => {},
		newTx: run,
		vacuum: async () => {},
		localUrl: "http://localhost",
		publicUrl: "http://localhost",
		background: (task) => {
			background.push(task(io));
		},
	};
	return {
		db,
		run,
		ctx,
		io,
		epic,
		wave,
		projectId,
		cache,
		events,
		background,
		enable: (maxConcurrency = 2, enabled = true) =>
			run((tx) =>
				set(ctx, tx, {
					epic: epic.id,
					autopilot: { enabled, maxConcurrency, harness, accountId: null },
				}),
			),
		get: () => run((tx) => get(ctx, tx, { epic: epic.id })),
		next: () => run((tx) => reserveNext(ctx, tx, { epicId: epic.id })),
		ticket: (title: string, input: { status?: string; wave?: string; after?: string[] } = {}) =>
			run((tx) => createTicket(ctx, tx, { project: "AUTO", epic: epic.id, wave: wave.id, title, ...input })),
		status: (ticket: string, category: string) =>
			run((tx) => update(ctx, tx, { ticket, status: `category:${category}` })),
	};
}
