import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ProviderSchema, type TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { create, get, list, remove, update } from "./providers.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const events: TrellisEvent[] = [];
const at = new Date("2026-09-24T20:00:00.000Z");

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const context = (kind: "human" | "agent" = "human") =>
	({
		actor: { kind, name: kind === "human" ? "Navid" : "provider-agent" },
		now: () => at,
		emit: (event: TrellisEvent) => events.push(event),
	}) as unknown as IoCtx;

beforeAll(async () => {
	db = await openTestDb();
}, 30_000);

beforeEach(async () => {
	events.length = 0;
	await db.execute(sql`DELETE FROM providers`);
});

afterAll(async () => {
	await db.$client.close();
});

describe("provider records", () => {
	test("keeps a long key out of every public service result", async () => {
		const firstKey = "provider-secret-1234";
		const created = await inTx((tx) =>
			create(context(), tx, {
				name: "Vercel",
				kind: "vercel-ai-gateway",
				apiKey: firstKey,
				models: ["typesafe-ai/jev"],
			}),
		);
		expect(ProviderSchema.parse(created)).toMatchObject({
			name: "Vercel",
			baseUrl: "https://ai-gateway.vercel.sh",
			keyLast4: "1234",
			enabled: true,
			models: ["typesafe-ai/jev"],
		});
		expect(created).not.toHaveProperty("apiKey");
		const listed = await inTx((tx) => list(context(), tx, {}));
		const fetched = await inTx((tx) => get(context(), tx, { id: created.id }));
		const kept = await inTx((tx) => update(context(), tx, { id: created.id, name: "Vercel Gateway" }));
		expect(kept.keyLast4).toBe("1234");

		const secondKey = "replacement-secret-5678";
		const changed = await inTx((tx) => update(context(), tx, { id: created.id, apiKey: secondKey }));
		expect(changed.keyLast4).toBe("5678");
		const deleted = await inTx((tx) => remove(context(), tx, { id: created.id }));
		const publicOutput = JSON.stringify([created, listed, fetched, kept, changed, deleted]);
		expect(publicOutput).not.toContain(firstKey);
		expect(publicOutput).not.toContain(secondKey);
		expect(events).toEqual([
			{ type: "providers.changed", id: created.id },
			{ type: "providers.changed", id: created.id },
			{ type: "providers.changed", id: created.id },
			{ type: "providers.changed", id: created.id },
		]);
	});

	test("never returns a key of one to four characters", async () => {
		for (const [index, key] of ["~", "~!", "~!#", "~!#$"].entries()) {
			const created = await inTx((tx) =>
				create(context(), tx, {
					name: `Short key ${index + 1}`,
					kind: "vercel-ai-gateway",
					apiKey: key,
				}),
			);
			const fetched = await inTx((tx) => get(context(), tx, { id: created.id }));
			const listed = await inTx((tx) => list(context(), tx, {}));
			expect(created.keyLast4).toBe("");
			expect(fetched.keyLast4).toBe("");
			expect(listed.find((provider) => provider.id === created.id)?.keyLast4).toBe("");
			expect(JSON.stringify([created, fetched, listed])).not.toContain(key);
		}

		const short = (await inTx((tx) => list(context(), tx, {})))[3]!;
		const longKey = "long-provider-key-ABCD";
		const long = await inTx((tx) => update(context(), tx, { id: short.id, apiKey: longKey }));
		expect(long.keyLast4).toBe("ABCD");
		const shortAgain = await inTx((tx) => update(context(), tx, { id: short.id, apiKey: "~!#$" }));
		expect(shortAgain.keyLast4).toBe("");
		expect(JSON.stringify([long, shortAgain])).not.toContain(longKey);
		expect(JSON.stringify(shortAgain)).not.toContain("~!#$");
	});

	test("refuses duplicate names and agent mutations", async () => {
		const first = await inTx((tx) =>
			create(context(), tx, { name: "Gateway", kind: "vercel-ai-gateway", apiKey: "secret-one" }),
		);
		await expect(
			inTx((tx) => create(context(), tx, { name: "gateway", kind: "vercel-ai-gateway", apiKey: "secret-two" })),
		).rejects.toMatchObject({
			code: "DUPLICATE",
			message: "A provider with this name exists.",
			data: { field: "name" },
		});
		const second = await inTx((tx) =>
			create(context(), tx, { name: "Other", kind: "vercel-ai-gateway", apiKey: "secret-three" }),
		);
		await expect(inTx((tx) => update(context(), tx, { id: second.id, name: "GATEWAY" }))).rejects.toMatchObject({
			code: "DUPLICATE",
			data: { field: "name" },
		});
		for (const call of [
			(tx: Tx) => create(context("agent"), tx, { name: "Agent", kind: "vercel-ai-gateway", apiKey: "key" }),
			(tx: Tx) => update(context("agent"), tx, { id: first.id, enabled: false }),
			(tx: Tx) => remove(context("agent"), tx, { id: first.id }),
		]) {
			await expect(inTx(call)).rejects.toMatchObject({
				code: "INPUT_VALIDATION_FAILED",
				message: "Only a person can manage providers.",
				data: { issues: [{ path: ["actor"] }] },
			});
		}
	});

	test("normalizes the base URL and replaces the model set", async () => {
		const created = await inTx((tx) =>
			create(context(), tx, {
				name: "Local",
				kind: "openai-compatible",
				baseUrl: "https://models.example.com/v1/",
				apiKey: "local-secret",
				models: ["qwen2.5-coder:7b", "Qwen/Qwen2.5-72B-Instruct"],
			}),
		);
		expect(created.baseUrl).toBe("https://models.example.com");
		expect(created.models).toEqual(["Qwen/Qwen2.5-72B-Instruct", "qwen2.5-coder:7b"]);
		const changed = await inTx((tx) => update(context(), tx, { id: created.id, models: ["gpt-oss-20b"] }));
		expect(changed.models).toEqual(["gpt-oss-20b"]);
		await expect(
			inTx((tx) =>
				create(context(), tx, {
					name: "No URL",
					kind: "openai-compatible",
					apiKey: "key",
				}),
			),
		).rejects.toThrow("Enter the https address of the endpoint, without /v1.");
		await expect(inTx((tx) => update(context(), tx, { id: created.id, models: ["model with space"] }))).rejects.toThrow(
			"Enter the model id as the endpoint names it, such as anthropic/claude-opus-5 or qwen2.5-coder:7b.",
		);
		await inTx((tx) => remove(context(), tx, { id: created.id }));
		const counts = (
			await db.execute(sql`SELECT count(*)::int AS count FROM provider_models WHERE provider_id = ${created.id}`)
		).rows as Array<{ count: number }>;
		expect(counts).toEqual([{ count: 0 }]);
	});

	test("refuses credentials, queries, and fragments in a base URL", async () => {
		for (const [name, baseUrl] of [
			["Credentials", "https://user:secret@models.example.com/v1"],
			["Query", "https://models.example.com/v1?region=local"],
			["Empty query", "https://models.example.com/v1?"],
			["Fragment", "https://models.example.com/v1#models"],
			["Empty fragment", "https://models.example.com/v1#"],
		] as const) {
			await expect(
				inTx((tx) =>
					create(context(), tx, {
						name,
						kind: "openai-compatible",
						baseUrl,
						apiKey: "local-secret",
					}),
				),
			).rejects.toThrow("Enter the https address of the endpoint, without /v1.");
		}
	});

	test("answers not found for an unknown provider", async () => {
		const id = ulid();
		await expect(inTx((tx) => get(context(), tx, { id }))).rejects.toMatchObject({
			code: "NOT_FOUND",
			data: { kind: "provider", ref: id },
		});
	});
});
