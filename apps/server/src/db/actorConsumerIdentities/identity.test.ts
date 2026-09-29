import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { candidates } from "../../services/needsYou/candidates.ts";
import { update } from "../../services/needsYou/needsYou.ts";
import type { IoCtx } from "../../services/support.ts";
import { openTestDb } from "../testDb.ts";
import { collisionActors } from "./fixture.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const projectId = ulid();
const statusId = ulid();
const ticketId = ulid();
const now = new Date("2026-09-29T20:00:00Z");

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at)
		VALUES (${projectId},'ACT','actor-consumers','Actor consumers',${now},${now})`);
	await db.execute(sql`INSERT INTO statuses
		(id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${statusId},${projectId},'Human Review','human-review','review','fg-muted',0,true,${now},${now})`);
	await db.execute(sql`INSERT INTO tickets
		(id,project_id,status_id,number,title,position,created_at,updated_at)
		VALUES (${ticketId},${projectId},${statusId},1,'Review actor identities',0,${now},${now})`);
}, 60_000);

afterAll(async () => db.$client.close());

const updateItem = async (actorName: string, itemId: string) => {
	const ctx = {
		core: { actor: { kind: "human", name: actorName }, now, emit: () => {} },
	} as unknown as IoCtx;
	return db.transaction((tx) =>
		update(ctx, tx, { input: { id: itemId, action: "ignore" as const }, workingTicketIds: [] }),
	);
};

test("attention updates retain complete and colliding actor identities", async () => {
	const longActors = [randomBytes(2048).toString("hex"), randomBytes(8192).toString("hex")];
	expect(longActors.map((actor) => actor.length)).toEqual([4096, 16384]);
	const actors = [...longActors, ...collisionActors];
	const [item] = await db.transaction((tx) => candidates(tx, actors[0]!));
	expect(item).toBeDefined();
	await Promise.all([updateItem(actors[0]!, item!.id), updateItem(actors[0]!, item!.id)]);
	for (const actor of actors.slice(1)) await updateItem(actor, item!.id);
	const hashes = await db.$client.query<{ collision: boolean }>(
		"SELECT hash_array(ARRAY[$1,$3])=hash_array(ARRAY[$2,$3]) AS collision",
		[...collisionActors, item!.id],
	);
	expect(hashes.rows).toEqual([{ collision: true }]);
	const stored = await db.$client.query<{ actor_name: string; ignored: boolean }>(
		"SELECT actor_name,ignored FROM needs_you_states WHERE item_id=$1 ORDER BY actor_name",
		[item!.id],
	);
	expect(stored.rows).toEqual(actors.toSorted().map((actor_name) => ({ actor_name, ignored: true })));
});
