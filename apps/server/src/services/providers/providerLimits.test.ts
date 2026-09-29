import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { ProviderSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { openTestDb } from "../../db/testDb.ts";
import type { IoCtx } from "../support.ts";
import { create, get, list, update } from "./providers";

let db: Awaited<ReturnType<typeof openTestDb>>;
const ctx = {
	actor: { kind: "human", name: "provider-test" },
	now: () => new Date("2026-09-29T20:00:00Z"),
	emit: () => {},
	afterCommit: () => {},
} as unknown as IoCtx;
const longText = (seed: string) =>
	Array.from({ length: 160 }, (_, index) => createHash("sha256").update(`${seed}:${index}`).digest("hex")).join("");

beforeAll(async () => {
	db = await openTestDb();
}, 60_000);
afterAll(async () => {
	await db.$client.close();
});

test("provider create, update, and reads preserve large configuration", async () => {
	const name = longText("name");
	const baseUrl = `https://example.com/${longText("url")}`;
	const apiKey = longText("synthetic-key");
	const models = Array.from({ length: 201 }, (_, index) => `${index}/${longText("model")}`);
	const created = await db.transaction((tx) =>
		create(ctx, tx, { name, kind: "openai-compatible", baseUrl, apiKey, models }),
	);
	expect(ProviderSchema.parse(created).name).toBe(name);
	expect(created.baseUrl).toBe(baseUrl);
	expect([...created.models].sort()).toEqual([...models].sort());
	const savedKey = await db.execute(sql`SELECT api_key = ${apiKey} AS exact FROM providers WHERE id = ${created.id}`);
	expect(savedKey.rows[0]!.exact).toBe(true);
	const fetched = await db.transaction((tx) => get(ctx, tx, { id: created.id }));
	const listed = await db.transaction((tx) => list(ctx, tx, {}));
	expect(fetched).toEqual(created);
	expect(listed.find((entry) => entry.id === created.id)).toEqual(created);
	const changedName = `${name}x`;
	const changedModels = [...models, longText("extra-model")];
	const changed = await db.transaction((tx) =>
		update(ctx, tx, { id: created.id, name: changedName, models: changedModels, baseUrl: `${baseUrl}/new` }),
	);
	expect(changed.id).toBe(created.id);
	expect(changed.name).toBe(changedName);
	expect(changed.baseUrl).toBe(`${baseUrl}/new`);
	expect(changed.models.length).toBe(202);
	expect([...changed.models].sort()).toEqual([...changedModels].sort());
	expect(JSON.stringify([created, fetched, listed, changed]).includes(apiKey)).toBe(false);
	await expect(
		db.transaction((tx) => create(ctx, tx, { name: changedName.toUpperCase(), kind: "vercel-ai-gateway", apiKey })),
	).rejects.toMatchObject({ code: "DUPLICATE" });
	await expect(
		db.execute(sql`INSERT INTO provider_models (provider_id, model_id) VALUES (${created.id}, ${models[0]!})`),
	).rejects.toMatchObject({ code: "23P01" });
});

test("name hash collisions preserve distinct values and reject equal names", async () => {
	const first = "1388e47d569e56c860147663319fc836";
	const second = "47364f1656759b480d825dac62cbdf66";
	const collision = await db.execute(sql`SELECT hashtext(${first}) = hashtext(${second}) AS equal`);
	expect(collision.rows[0]!.equal).toBe(true);
	for (const name of [first, second]) {
		const saved = await db.transaction((tx) =>
			create(ctx, tx, { name, kind: "vercel-ai-gateway", apiKey: "synthetic" }),
		);
		expect(saved.name).toBe(name);
	}
	await expect(
		db.execute(sql`INSERT INTO providers (id,name,kind,base_url,api_key,created_at,updated_at)
			VALUES ('duplicate', ${first.toUpperCase()}, 'vercel-ai-gateway', 'https://example.com', 'synthetic', now(), now())`),
	).rejects.toMatchObject({ code: "23P01" });
});

test("model hash collisions preserve distinct values within one provider", async () => {
	const id = "01M2Q0Z191Q244RDP6R3SBFKE5";
	const first = "3fe938528661ce52e81a4fc7790b5560";
	const second = "155dd5d51532375f5bd5f1723a1dd54f";
	const prefix = `${id.length}:${id}`;
	const collision = await db.execute(sql`SELECT hashtext(${prefix + first}) = hashtext(${prefix + second}) AS equal`);
	expect(collision.rows[0]!.equal).toBe(true);
	await db.execute(sql`INSERT INTO providers (id,name,kind,base_url,api_key,created_at,updated_at)
		VALUES (${id}, 'Collision models', 'vercel-ai-gateway', 'https://example.com', 'synthetic', now(), now())`);
	const saved = await db.transaction((tx) => update(ctx, tx, { id, models: [first, second] }));
	expect(saved.models).toEqual([second, first]);
	await expect(
		db.execute(sql`INSERT INTO provider_models (provider_id, model_id) VALUES (${id}, ${first})`),
	).rejects.toMatchObject({ code: "23P01" });
});
