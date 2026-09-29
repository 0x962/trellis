import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { openTestDb } from "../testDb";
import { seed } from "./seed";

let db: Awaited<ReturnType<typeof openTestDb>>;
beforeAll(async () => {
	db = await openTestDb();
	await seed(db);
}, 60_000);
afterAll(async () => db.$client.close());

async function clone(table: string, where: string, patch: Record<string, unknown>) {
	const columns = (
		await db.$client.query<{ name: string }>(
			`
		SELECT attname AS name FROM pg_attribute
		WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=''
		ORDER BY attnum`,
			[table],
		)
	).rows
		.map(({ name }) => `"${name}"`)
		.join(",");
	return db.$client.query(
		`INSERT INTO "${table}" (${columns})
		SELECT ${columns} FROM jsonb_populate_record(NULL::"${table}",
		(SELECT to_jsonb(t) FROM "${table}" t WHERE ${where}) || $1::jsonb)`,
		[JSON.stringify(patch)],
	);
}

test("long text identities retain exact equality and their original scope", async () => {
	const text = randomBytes(8192).toString("hex");
	await clone("projects", "id='p'", { id: "p2", key: "QB", slug: "qb" });
	await clone("epics", "id='e'", { id: "e2", project_id: "p2" });
	await clone("label_groups", "id='group'", { id: "group2", project_id: "p2" });
	const cases = [
		{ table: "statuses", where: "id='s'", patch: { name: text, slug: "name-case" }, scope: { project_id: "p2" } },
		{ table: "statuses", where: "id='s'", patch: { name: "Slug case", slug: text }, scope: { project_id: "p2" } },
		{ table: "epics", where: "id='e'", patch: { slug: text }, scope: { project_id: "p2" } },
		{ table: "waves", where: "id='w'", patch: { slug: text }, scope: { epic_id: "e2" } },
		{ table: "pages", where: "id='page'", patch: { slug: text }, scope: { project_id: "p2" } },
		{ table: "label_groups", where: "id='group'", patch: { name: text }, scope: { project_id: "p2" } },
		{ table: "labels", where: "id='label'", patch: { name: text }, scope: { project_id: "p2", group_id: "group2" } },
		{ table: "labels", where: "id='ungrouped'", patch: { name: text }, scope: { project_id: "p2" } },
	];
	for (const [i, entry] of cases.entries()) {
		await clone(entry.table, entry.where, { id: `long-${i}`, ...entry.patch });
		await expect(clone(entry.table, entry.where, { id: `duplicate-${i}`, ...entry.patch })).rejects.toMatchObject({
			code: "23P01",
		});
		await clone(entry.table, entry.where, { id: `scope-${i}`, ...entry.patch, ...entry.scope });
		const distinct = Object.fromEntries(Object.entries(entry.patch).map(([key, value]) => [key, `${value}b`]));
		await clone(entry.table, entry.where, { id: `suffix-${i}`, ...distinct });
	}
	await clone("providers", "id='provider'", { id: "long-provider", name: text });
	await expect(
		clone("providers", "id='provider'", { id: "duplicate-provider", name: text.toUpperCase() }),
	).rejects.toMatchObject({ code: "23P01" });
	await clone("providers", "id='provider'", { id: "suffix-provider", name: `${text}b` });
	await clone("provider_models", "model_id='model'", { model_id: text });
	await expect(clone("provider_models", "model_id='model'", { model_id: text })).rejects.toMatchObject({
		code: "23P01",
	});
	await clone("provider_models", "model_id='model'", { model_id: `${text}b` });
	await clone("provider_models", "model_id='model'", { provider_id: "long-provider", model_id: text });
	await clone("agent_start_requests", "request_id='request'", { request_id: text, actor_name: text });
	await expect(
		clone("agent_start_requests", "request_id='request'", { request_id: text, actor_name: text }),
	).rejects.toMatchObject({ code: "23P01" });
	await clone("agent_start_requests", "request_id='request'", { request_id: `${text}b`, actor_name: text });
	await clone("agent_start_requests", "request_id='request'", { request_id: text, actor_name: `${text}b` });
	await expect(clone("labels", "id='ungrouped'", { id: "case-label", name: text.toUpperCase() })).rejects.toMatchObject(
		{ code: "23P01" },
	);
	await expect(
		clone("label_groups", "id='group'", { id: "case-group", name: text.toUpperCase() }),
	).rejects.toMatchObject({ code: "23P01" });
});

test("a hash collision permits distinct values but refuses an equal value", async () => {
	const names = ["1388e47d569e56c860147663319fc836", "47364f1656759b480d825dac62cbdf66"];
	const hashes = await db.$client.query<{ a: number; b: number }>("SELECT hashtext($1) AS a, hashtext($2) AS b", names);
	expect(hashes.rows[0]!.a).toBe(hashes.rows[0]!.b);
	for (const [i, name] of names.entries()) await clone("providers", "id='provider'", { id: `collision-${i}`, name });
	await expect(
		clone("providers", "id='provider'", { id: "collision-duplicate", name: names[0] }),
	).rejects.toMatchObject({ code: "23P01" });
	const provider = "01M2Q0Z191Q244RDP6R3SBFKE5";
	await clone("providers", "id='provider'", { id: provider, name: "Collision models" });
	const models = ["3fe938528661ce52e81a4fc7790b5560", "155dd5d51532375f5bd5f1723a1dd54f"];
	const modelHashes = await db.$client.query<{ a: number; b: number }>(
		"SELECT hashtext($1) AS a, hashtext($2) AS b",
		models.map((model) => `${provider.length}:${provider}${model}`),
	);
	expect(modelHashes.rows[0]!.a).toBe(modelHashes.rows[0]!.b);
	for (const model of models)
		await clone("provider_models", "model_id='model'", { provider_id: provider, model_id: model });
	await expect(
		clone("provider_models", "model_id='model'", { provider_id: provider, model_id: models[0] }),
	).rejects.toMatchObject({ code: "23P01" });
	await db.$client.query("DELETE FROM providers WHERE id=$1", [provider]);
	expect((await db.$client.query("SELECT * FROM provider_models WHERE provider_id=$1", [provider])).rows).toEqual([]);
});
