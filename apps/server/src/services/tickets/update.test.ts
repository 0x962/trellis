import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import { type Tx, withTx } from "../../db/tx.ts";
import { update } from "./update.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;

const run = <T>(fn: (tx: Tx) => Promise<T>) => withTx(db, fn).then(({ result }) => result);

beforeAll(async () => {
	db = await openTestDb();
	ctx = {
		actor: { kind: "human", name: "Test" },
		session: null,
		reqId: ulid(),
		now: new Date("2026-09-29T06:00:00Z"),
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
});

afterAll(async () => db.$client.close());

test("parent updates reject a cycle and accept a valid move beyond 64 levels", async () => {
	const projectId = ulid();
	const statusId = ulid();
	const at = ctx.now.toISOString();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'DEEP', 'deep', 'Deep hierarchy', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);

	const chain = Array.from({ length: 67 }, () => ulid());
	for (const [index, id] of chain.entries()) {
		await db.execute(sql`INSERT INTO tickets
			(id, project_id, number, title, status_id, parent_id, position, created_at, updated_at)
			VALUES (${id}, ${projectId}, ${index + 1}, ${`Chain ${index + 1}`}, ${statusId},
				${index === 0 ? null : chain[index - 1]!}, ${index}, ${at}, ${at})`);
	}
	const movable = ulid();
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${movable}, ${projectId}, 68, 'Movable', ${statusId}, 67, ${at}, ${at})`);
	await run((tx) => ctx.cache.rebuild(tx));

	await expect(run((tx) => update(ctx, tx, { ticket: chain[0]!, parent: chain.at(-1)! }))).rejects.toMatchObject({
		code: "PARENT_CYCLE",
	});
	expect((await db.execute(sql`SELECT parent_id FROM tickets WHERE id = ${chain[0]!}`)).rows).toEqual([
		{ parent_id: null },
	]);
	const moved = await run((tx) => update(ctx, tx, { ticket: movable, parent: chain.at(-1)! }));

	expect(moved.parent?.id).toBe(chain.at(-1));
});
