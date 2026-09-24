import { afterAll, beforeAll, expect, test } from "bun:test";
import { ProviderModelsSchema } from "@trellis/api";
import { openTestDb } from "../../db/testDb.ts";
import { prepareModels } from "./models.ts";
import { preparePublicModels } from "./publicModels.ts";
import { remoteHarness } from "./testSupport/testSupport.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
beforeAll(async () => {
	db = await openTestDb();
}, 30_000);
afterAll(async () => {
	await db.$client.close();
});
const model = (id: string, type = "language") => ({ id, name: id.toUpperCase(), type });

test("reads and sorts public language models without a key outside the transaction", async () => {
	const h = remoteHarness(db);
	const provider = await h.create();
	const deps = {
		now: h.now,
		fetch: h.fetch(async (url, init) => {
			expect(url).toBe("https://ai-gateway.vercel.sh/v1/models");
			expect(init.headers).toEqual({});
			return Response.json({ data: [model("z"), model("embedding", "embedding"), model("a")] });
		}),
	};
	const result = await prepareModels(h.ctx, provider, deps);
	expect(result).toEqual({
		ok: true,
		detail: null,
		fetchedAt: new Date(h.now()).toISOString(),
		models: [
			{ id: "a", name: "A", type: "language" },
			{ id: "z", name: "Z", type: "language" },
		],
	});
	expect(ProviderModelsSchema.parse(result)).toEqual(result);
	expect(await preparePublicModels(h.ctx, { kind: "vercel-ai-gateway" }, deps)).toEqual(result);
});

test("keeps an empty successful catalog distinct from a failed fetch", async () => {
	const h = remoteHarness(db);
	const provider = await h.create();
	const result = await prepareModels(h.ctx, provider, {
		now: h.now,
		fetch: h.fetch(async () => Response.json({ data: [model("embed", "embedding")] })),
	});
	expect(result).toMatchObject({ ok: true, detail: null, models: [] });
	expect(ProviderModelsSchema.safeParse({ ...result, ok: false }).success).toBe(false);
	expect(ProviderModelsSchema.safeParse({ ...result, detail: "failure" }).success).toBe(false);
	expect(ProviderModelsSchema.safeParse({ ...result, unknown: true }).success).toBe(false);
});

test("returns an empty public compatible catalog without a fetch", async () => {
	const h = remoteHarness(db);
	const result = await preparePublicModels(
		h.ctx,
		{ kind: "openai-compatible" },
		{
			now: h.now,
			fetch: async () => {
				throw new Error("must not fetch");
			},
		},
	);
	expect(result).toMatchObject({ ok: true, detail: null, models: [] });
});

test("uses the key only in the compatible authorization header and accepts standard model entries", async () => {
	const h = remoteHarness(db);
	const key = "compatible-secret-9876";
	const provider = await h.create({ kind: "openai-compatible", baseUrl: "https://example.com/proxy", apiKey: key });
	const result = await prepareModels(h.ctx, provider, {
		now: h.now,
		fetch: h.fetch(async (url, init) => {
			expect(url).toBe("https://example.com/proxy/v1/models");
			expect(init.headers).toEqual({ Authorization: `Bearer ${key}` });
			expect(url).not.toContain(key);
			expect(init.body).toBeUndefined();
			return Response.json({ data: [{ id: "Qwen:7b", object: "model" }] });
		}),
	});
	expect(result).toMatchObject({ ok: true, models: [{ id: "Qwen:7b", name: "Qwen:7b", type: "language" }] });
	expect(JSON.stringify([result, h.logs])).not.toContain(key);
});

for (const [status, detail] of [
	[401, "The provider refused the key."],
	[403, "The provider refused the request."],
	[502, "The provider answered HTTP 502."],
	[302, "The provider answered HTTP 302."],
] as const) {
	test(`maps HTTP ${status} without the echoed header`, async () => {
		const h = remoteHarness(db);
		const key = "secret-echo-models";
		const provider = await h.create({ kind: "openai-compatible", baseUrl: "https://example.com", apiKey: key });
		const result = await prepareModels(h.ctx, provider, {
			now: h.now,
			fetch: h.fetch(async (_url, init) => new Response(JSON.stringify(init.headers), { status })),
		});
		expect(result).toMatchObject({ ok: false, detail, models: [] });
		expect(ProviderModelsSchema.parse(result)).toEqual(result);
		expect(JSON.stringify([result, h.logs])).not.toContain(key);
		expect(JSON.stringify(h.logs)).not.toContain("Authorization");
	});
}

for (const failure of ["network", "timeout", "json", "shape", "echo"] as const) {
	test(`maps ${failure} to a safe catalog failure`, async () => {
		const h = remoteHarness(db);
		const key = "secret-echo-models";
		const provider = await h.create({ kind: "openai-compatible", baseUrl: "https://example.com", apiKey: key });
		const result = await prepareModels(h.ctx, provider, {
			now: h.now,
			fetch: h.fetch(async () => {
				if (failure === "network") throw new Error(key);
				if (failure === "timeout") throw new DOMException(key, "TimeoutError");
				if (failure === "json") return new Response(key);
				if (failure === "shape") return Response.json({ error: key });
				return Response.json({ data: [{ id: key }] });
			}),
		});
		expect(result).toMatchObject({ ok: false, detail: "Trellis cannot reach example.com.", models: [] });
		expect(JSON.stringify([result, h.logs])).not.toContain(key);
	});
}

test("caches catalogs for five minutes and refreshes after one second", async () => {
	const h = remoteHarness(db);
	const provider = await h.create();
	let calls = 0;
	const deps = {
		now: h.now,
		fetch: h.fetch(async () => {
			calls++;
			return Response.json({ data: [] });
		}),
	};
	await prepareModels(h.ctx, provider, deps);
	h.advance(999);
	await prepareModels(h.ctx, { id: provider.id, refresh: true }, deps);
	expect(calls).toBe(1);
	h.advance(1);
	await prepareModels(h.ctx, { id: provider.id, refresh: true }, deps);
	expect(calls).toBe(2);
	h.advance(299_999);
	await prepareModels(h.ctx, provider, deps);
	expect(calls).toBe(2);
	h.advance(1);
	await prepareModels(h.ctx, provider, deps);
	expect(calls).toBe(3);
});

test("never returns an echoed key with JSON escape characters", async () => {
	const h = remoteHarness(db);
	const key = 'secret\\key"123';
	const provider = await h.create({ kind: "openai-compatible", baseUrl: "https://example.com", apiKey: key });
	const result = await prepareModels(h.ctx, provider, {
		now: h.now,
		fetch: h.fetch(async () => Response.json({ data: [{ id: key }] })),
	});
	expect(result).toMatchObject({ ok: false, models: [], detail: "Trellis cannot reach example.com." });
});

test("reuses public catalogs within five minutes and applies the refresh floor", async () => {
	const h = remoteHarness(db);
	let calls = 0;
	const deps = {
		now: h.now,
		fetch: h.fetch(async () => {
			calls++;
			return Response.json({ data: [] });
		}),
	};
	await preparePublicModels(h.ctx, { kind: "vercel-ai-gateway" }, deps);
	h.advance(1000);
	await preparePublicModels(h.ctx, { kind: "vercel-ai-gateway" }, deps);
	expect(calls).toBe(1);
	await preparePublicModels(h.ctx, { kind: "vercel-ai-gateway", refresh: true }, deps);
	expect(calls).toBe(2);
});
