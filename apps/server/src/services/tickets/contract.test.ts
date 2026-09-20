import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { ticketSummary } from "../../db/queries/ticketGet.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { contract } from "./contract.ts";
import { create } from "./create.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const rootId = ulid();
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, ${rootId}, 'CON', 'con', 'Contract', '2026-09-20T10:00:00Z', '2026-09-20T10:00:00Z')`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true,
			'2026-09-20T10:00:00Z', '2026-09-20T10:00:00Z')`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "Test" } satisfies ActorRef,
		session: null,
		reqId: ulid(),
		now: new Date("2026-09-20T10:01:00Z"),
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

afterAll(async () => db.$client.close());

test("the contract write stores detail fields and keeps them out of the summary", async () => {
	const created = await run((tx) => create(ctx, tx, { project: "CON", title: "Add a contract" }));
	expect(created.contract).toEqual({ result: "", files: [], leaveAlone: [], verify: [], reviewFocus: [] });
	const input = {
		ticket: created.identifier,
		result: "The ticket stores its contract.",
		files: ["packages/api/src/schemas/ticket.ts"],
		leaveAlone: ["packages/cli/**"],
		verify: ["bun test apps/server/src/services/tickets"],
		reviewFocus: ["The detail response holds the paths."],
		expectedVersion: created.version,
	};
	const updated = await run((tx) => contract(ctx, tx, input));
	expect(updated.contract).toEqual({
		result: input.result,
		files: input.files,
		leaveAlone: input.leaveAlone,
		verify: input.verify,
		reviewFocus: input.reviewFocus,
	});
	expect(updated.version).toBe(created.version + 1);
	expect(await run((tx) => ticketSummary(tx, created.id))).not.toHaveProperty("contract");
	const repeated = await run((tx) => contract(ctx, tx, { ...input, expectedVersion: updated.version }));
	expect(repeated.version).toBe(updated.version);
});
