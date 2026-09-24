import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { create, update } from "./providers.ts";
import { keyOf } from "./secret.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const at = new Date("2026-09-24T22:00:00.000Z");

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const context = {
	actor: { kind: "human", name: "Navid" },
	afterCommit: () => {},
	now: () => at,
	emit: (_event: TrellisEvent) => {},
} as unknown as IoCtx;

beforeAll(async () => {
	db = await openTestDb();
}, 30_000);

beforeEach(async () => {
	await db.execute(sql`DELETE FROM providers`);
});

afterAll(async () => {
	await db.$client.close();
});

describe("provider secrets", () => {
	test("reads the complete key and preserves it when update omits apiKey", async () => {
		const originalKey = "provider-secret-original";
		const provider = await inTx((tx) =>
			create(context, tx, {
				name: "Vercel",
				kind: "vercel-ai-gateway",
				apiKey: originalKey,
			}),
		);
		expect(await inTx((tx) => keyOf(tx, provider.id))).toBe(originalKey);

		await inTx((tx) => update(context, tx, { id: provider.id, name: "Vercel Gateway" }));
		expect(await inTx((tx) => keyOf(tx, provider.id))).toBe(originalKey);

		const replacementKey = "provider-secret-replacement";
		await inTx((tx) => update(context, tx, { id: provider.id, apiKey: replacementKey }));
		expect(await inTx((tx) => keyOf(tx, provider.id))).toBe(replacementKey);
	});

	test("answers not found for an unknown provider", async () => {
		const id = ulid();
		await expect(inTx((tx) => keyOf(tx, id))).rejects.toMatchObject({
			code: "NOT_FOUND",
			data: { kind: "provider", ref: id },
		});
	});

	test("keeps the complete key query in the secret reader", async () => {
		const files = (await readdir(import.meta.dir)).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
		const sources = await Promise.all(
			files.map(async (file) => [file, await readFile(join(import.meta.dir, file), "utf8")] as const),
		);
		const readers = sources.flatMap(([file, source]) =>
			Array.from(source.matchAll(/sql`([\s\S]*?)`/gu))
				.filter(([, query]) => /\bSELECT\b/iu.test(query ?? "") && /\bapi_key\b/iu.test(query ?? ""))
				.map(() => file),
		);
		expect(readers).toEqual(["secret.ts"]);
	});
});
