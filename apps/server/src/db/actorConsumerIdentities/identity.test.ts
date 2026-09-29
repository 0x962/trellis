import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { candidates } from "../../services/needsYou/candidates.ts";
import { update } from "../../services/needsYou/needsYou.ts";
import { ensurePr } from "../../services/reviews/queries.ts";
import type { IoCtx } from "../../services/support.ts";
import type { Db } from "../client.ts";
import { seed } from "../limitRemoval/seed.ts";
import { openTestDb } from "../testDb.ts";
import { applyActorConsumerIdentitySql, cloneRow, collisionActors } from "./fixture.ts";

let db: Db;
const now = "2026-09-29T20:00:00Z";

beforeAll(async () => {
	db = await openTestDb();
	await seed(db);
	const pullRequest = await db.transaction((tx) => ensurePr(tx, "example/app#954"));
	await db.execute(sql`INSERT INTO flow_executions
		(id,flow_id,ticket_id,project_id,actor_kind,actor_name,request_id,request,doc,state,revision,created_at,updated_at)
		VALUES ('flow-base','flow','t','p','human','fixture','request','{}','{}','{}',1,${now},${now})`);
	await db.execute(sql`INSERT INTO langflow_executions
		(execution_id,flow_id,ticket_id,project_id,publication_id,publication,snapshot,host_id,actor_kind,actor_name,
		 request_id,request_bytes,submission_bytes,submission,admission,revision,created_at)
		VALUES ('lang-base','flow','t','p','publication','{}','{}','host','human','fixture',
		 'request','request','submission','{}','{}',1,${now})`);
	await db.execute(sql`INSERT INTO langflow_start_receipts
		(actor_kind,actor_name,request_id,request_bytes,execution_id,langflow_execution_id)
		VALUES ('human','fixture','request','request','lang-base','lang-base')`);
	await db.execute(sql`INSERT INTO native_migrations
		(id,project_id,actor_name,request_id,request,before_inventory,document,created_at)
		VALUES ('native-base','p','fixture','request','{}','{}','{}',${now})`);
	await db.execute(sql`INSERT INTO needs_you_states
		(actor_name,item_id,ticket_id,updated_at) VALUES ('fixture','item','t',${now})`);
	await db.execute(sql`INSERT INTO review_submissions
		(id,pr_id,request_id,actor,document,created_at)
		VALUES ('review-base',${pullRequest.id},'request','fixture','{}',${now})`);
	await db.execute(sql`UPDATE statuses SET category='review' WHERE id='s'`);
	await applyActorConsumerIdentitySql(db);
}, 60_000);

afterAll(async () => db.$client.close());

const addActor = async (actor: string, suffix: string) => {
	await cloneRow(db, "flow_executions", "id='flow-base'", { id: `flow-${suffix}`, actor_name: actor });
	await cloneRow(db, "langflow_executions", "execution_id='lang-base'", {
		execution_id: `lang-${suffix}`,
		actor_name: actor,
	});
	await cloneRow(db, "langflow_start_receipts", "execution_id='lang-base'", {
		actor_name: actor,
		execution_id: `lang-${suffix}`,
		langflow_execution_id: `lang-${suffix}`,
	});
	await cloneRow(db, "native_migrations", "id='native-base'", {
		id: `native-${suffix}`,
		actor_name: actor,
		rolled_back_at: now,
	});
	await cloneRow(db, "needs_you_states", "actor_name='fixture'", { actor_name: actor });
	await cloneRow(db, "review_submissions", "id='review-base'", { id: `review-${suffix}`, actor });
};

const expectEqualReplayRejected = async (actor: string, suffix: string) => {
	for (const operation of [
		() => cloneRow(db, "flow_executions", "id='flow-base'", { id: `flow-duplicate-${suffix}`, actor_name: actor }),
		() =>
			cloneRow(db, "langflow_executions", "execution_id='lang-base'", {
				execution_id: `lang-duplicate-${suffix}`,
				actor_name: actor,
			}),
		() =>
			cloneRow(db, "langflow_start_receipts", "execution_id='lang-base'", {
				actor_name: actor,
				execution_id: `lang-${suffix}`,
				langflow_execution_id: `lang-${suffix}`,
			}),
		() =>
			cloneRow(db, "native_migrations", "id='native-base'", {
				id: `native-duplicate-${suffix}`,
				actor_name: actor,
				rolled_back_at: now,
			}),
		() => cloneRow(db, "needs_you_states", "actor_name='fixture'", { actor_name: actor }),
		() =>
			cloneRow(db, "review_submissions", "id='review-base'", {
				id: `review-duplicate-${suffix}`,
				actor,
			}),
	])
		await expect(operation()).rejects.toMatchObject({ code: "23P01" });
};

test("complete actor names retain exact identity across every durable consumer", async () => {
	const actor4096 = randomBytes(2048).toString("hex");
	const common = randomBytes(8191).toString("hex");
	const actors = [actor4096, `${common}aa`, `${common}ab`];
	expect(actors.map((actor) => actor.length)).toEqual([4096, 16384, 16384]);
	for (const [index, actor] of actors.entries()) {
		await addActor(actor, `long-${index}`);
		await expectEqualReplayRejected(actor, `long-${index}`);
	}
	const stored = await db.$client.query<{ actor_name: string }>(
		"SELECT actor_name FROM flow_executions WHERE actor_name LIKE $1 ORDER BY actor_name",
		[`${common}%`],
	);
	expect(stored.rows.map((row) => row.actor_name)).toEqual([`${common}aa`, `${common}ab`]);
});

test("real array hash collisions retain distinct actors and reject equal replay", async () => {
	const hashes = await db.$client.query<{ three: boolean; two: boolean; review: boolean }>(
		`SELECT
			hash_array(ARRAY['human',$1,'request'])=hash_array(ARRAY['human',$2,'request']) AS three,
			hash_array(ARRAY[$1,'request'])=hash_array(ARRAY[$2,'request']) AS two,
			hash_array(ARRAY['pr',$1,'request'])=hash_array(ARRAY['pr',$2,'request']) AS review`,
		[...collisionActors],
	);
	expect(hashes.rows[0]).toEqual({ three: true, two: true, review: true });
	for (const [index, actor] of collisionActors.entries()) await addActor(actor, `collision-${index}`);
	await expectEqualReplayRejected(collisionActors[0], "collision-0");
});

test("concurrent attention updates keep one exact long-actor state", async () => {
	const actor = randomBytes(8192).toString("hex");
	const [item] = await db.transaction((tx) => candidates(tx, actor));
	const ctx = {
		core: { actor: { kind: "human", name: actor }, now: new Date(now), emit: () => {} },
	} as unknown as IoCtx;
	const prepared = { input: { id: item!.id, action: "ignore" as const }, workingTicketIds: [] };
	await Promise.all([
		db.transaction((tx) => update(ctx, tx, prepared)),
		db.transaction((tx) => update(ctx, tx, prepared)),
	]);
	const stored = await db.$client.query<{ actor_name: string; ignored: boolean }>(
		"SELECT actor_name,ignored FROM needs_you_states WHERE ARRAY[actor_name,item_id]=ARRAY[$1,$2]",
		[actor, item!.id],
	);
	expect(stored.rows).toEqual([{ actor_name: actor, ignored: true }]);
});

test("the identity change preserves existing rows and receipt deletion cascades", async () => {
	for (const table of [
		"flow_executions",
		"langflow_executions",
		"langflow_start_receipts",
		"native_migrations",
		"needs_you_states",
		"review_submissions",
	]) {
		const result = await db.$client.query<{ count: number }>(`SELECT count(*)::integer AS count FROM "${table}"`);
		expect(result.rows[0]!.count).toBeGreaterThan(0);
	}
	await db.$client.query("DELETE FROM langflow_executions WHERE execution_id='lang-collision-1'");
	const receipt = await db.$client.query("SELECT 1 FROM langflow_start_receipts WHERE execution_id='lang-collision-1'");
	expect(receipt.rows).toEqual([]);
});
