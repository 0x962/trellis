import { afterAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import type { Db } from "../client.ts";
import { migrate } from "../migrate.ts";
import { openPriorDatabase } from "./history.ts";
import { seedActorHistory } from "./seed.ts";

let db: Db;
let directory: string;
afterAll(async () => {
	await db?.$client.close();
	if (directory) await rm(directory, { recursive: true });
});

async function clone(table: string, where: string, patch: Record<string, unknown>) {
	const fields = (
		await db.$client.query<{ name: string }>(
			`
		SELECT attname AS name FROM pg_attribute WHERE attrelid=$1::regclass
		AND attnum>0 AND NOT attisdropped AND attgenerated='' ORDER BY attnum
	`,
			[table],
		)
	).rows
		.map(({ name }) => `"${name}"`)
		.join(",");
	return db.$client.query(
		`INSERT INTO "${table}" (${fields}) SELECT ${fields}
		FROM jsonb_populate_record(NULL::"${table}",
		(SELECT to_jsonb(t) FROM "${table}" t WHERE ${where}) || $1::jsonb)`,
		[JSON.stringify(patch)],
	);
}

const copies = (name: string, suffix: string): [string, string, Record<string, unknown>][] => [
	["flow_executions", "id='legacy-run'", { id: `legacy-${suffix}`, actor_name: name }],
	["langflow_executions", "execution_id='engine-run'", { execution_id: `engine-${suffix}`, actor_name: name }],
	[
		"langflow_start_receipts",
		"execution_id='engine-run'",
		{
			actor_name: name,
			execution_id: `engine-${suffix}`,
			langflow_execution_id: `engine-${suffix}`,
		},
	],
	[
		"native_migrations",
		"id='native'",
		{ id: `native-${suffix}`, actor_name: name, rolled_back_at: "2026-09-29T20:00:00Z" },
	],
	["needs_you_states", "actor_name='fixture'", { actor_name: name }],
	["review_submissions", "id='review'", { id: `review-${suffix}`, actor: name }],
];

test("0139 accepts complete actor identities and rechecks exact values on hash collisions", async () => {
	({ db, directory } = await openPriorDatabase());
	await seedActorHistory(db);
	expect(await migrate(db)).toBeGreaterThan(0);
	const common = randomBytes(8191).toString("hex");
	const names = [randomBytes(2048).toString("hex"), `${common}aa`, `${common}ab`, "15601", "180514"];
	expect(names.slice(0, 3).map((name) => name.length)).toEqual([4096, 16384, 16384]);
	expect(
		(await db.$client.query("SELECT hash_array(ARRAY['human','15601'])=hash_array(ARRAY['human','180514']) AS equal"))
			.rows,
	).toEqual([{ equal: true }]);
	const ids: string[] = [];
	for (const [index, name] of names.entries()) {
		const actor = (
			await db.$client.query<{ id: string }>(
				`
			INSERT INTO actors (name,kind,first_seen_at,last_seen_at) VALUES ($1,'human',now(),now()) RETURNING id
		`,
				[name],
			)
		).rows[0]!;
		ids.push(actor.id);
		await expect(
			db.$client.query("INSERT INTO actors (name,kind,first_seen_at,last_seen_at) VALUES ($1,'human',now(),now())", [
				name,
			]),
		).rejects.toMatchObject({ code: "23P01", constraint: "actors_identity_equality" });
		const pin = { actor_id: actor.id, actor_name: name };
		await clone("page_pins", "actor_name='fixture' AND actor_kind='human'", pin);
		await expect(clone("page_pins", "actor_name='fixture' AND actor_kind='human'", pin)).rejects.toMatchObject({
			code: "23505",
		});
		await clone("page_uploads", "id='upload'", { id: `upload-${index}`, ...pin });
		await clone("page_versions", "number=1", { number: index + 2, request_id: `version-${index}`, ...pin });
		for (const entry of copies(name, `long-${index}`)) await clone(...entry);
		for (const entry of copies(name, `duplicate-${index}`))
			await expect(clone(...entry)).rejects.toMatchObject({ code: "23P01" });
	}
	expect(new Set(ids).size).toBe(names.length);
	const stored = (
		await db.$client.query<{ name: string }>("SELECT name FROM actors WHERE id=ANY($1::uuid[]) ORDER BY name", [ids])
	).rows;
	expect(stored.map((row) => row.name)).toEqual([...names].sort());
	await expect(
		clone("page_uploads", "id='upload'", { id: "wrong-upload", actor_id: ids[0], actor_name: names[1] }),
	).rejects.toMatchObject({ code: "23503" });
	const collision = ["1388e47d569e56c860147663319fc836", "47364f1656759b480d825dac62cbdf66"];
	expect(
		(
			await db.$client.query(
				`SELECT
		hash_array(ARRAY['human',$1,'request'])=hash_array(ARRAY['human',$2,'request']) AS three,
		hash_array(ARRAY[$1,'request'])=hash_array(ARRAY[$2,'request']) AS two,
		hash_array(ARRAY['pr',$1,'request'])=hash_array(ARRAY['pr',$2,'request']) AS review`,
				collision,
			)
		).rows,
	).toEqual([{ three: true, two: true, review: true }]);
	for (const [index, name] of collision.entries())
		for (const entry of copies(name, `collision-${index}`)) await clone(...entry);
	for (const entry of copies(collision[0]!, "collision-duplicate"))
		await expect(clone(...entry)).rejects.toMatchObject({ code: "23P01" });
	await db.$client.query("DELETE FROM langflow_executions WHERE execution_id='engine-collision-1'");
	expect(
		(await db.$client.query("SELECT 1 FROM langflow_start_receipts WHERE execution_id='engine-collision-1'")).rows,
	).toEqual([]);
}, 120_000);
