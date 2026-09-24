import { afterAll, beforeAll, expect, test } from "bun:test";
import { ProviderCheckSchema } from "@trellis/api";
import { openTestDb } from "../../db/testDb.ts";
import { prepareCheck } from "./check.ts";
import { prepareModels } from "./models.ts";
import { remove, update } from "./providers.ts";
import { remoteHarness } from "./testSupport/testSupport.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
beforeAll(async () => {
	db = await openTestDb();
}, 30_000);
afterAll(async () => {
	await db.$client.close();
});

test("checks gateway credits with the key only in the header outside the transaction", async () => {
	const h = remoteHarness(db);
	const provider = await h.create();
	const result = await prepareCheck(h.ctx, provider, {
		now: h.now,
		fetch: h.fetch(async (url, init) => {
			expect(url).toBe("https://ai-gateway.vercel.sh/v1/credits");
			expect(init.headers).toEqual({ Authorization: "Bearer secret-provider-1234" });
			expect(init.body).toBeUndefined();
			return Response.json({ balance: "95.5000", total_used: "4.50" });
		}),
	});
	expect(result).toEqual({ ok: true, detail: null, balance: "95.5000", checkedAt: new Date(h.now()).toISOString() });
	expect(ProviderCheckSchema.parse(result)).toEqual(result);
	expect(JSON.stringify([result, h.logs])).not.toContain("secret-provider-1234");
	expect(ProviderCheckSchema.safeParse({ ...result, ok: false }).success).toBe(false);
});

test("checks compatible models and returns no balance", async () => {
	const h = remoteHarness(db);
	const provider = await h.create({ kind: "openai-compatible", baseUrl: "https://example.com" });
	const result = await prepareCheck(h.ctx, provider, {
		now: h.now,
		fetch: h.fetch(async (url, init) => {
			expect(url).toBe("https://example.com/v1/models");
			expect(init.headers).toEqual({ Authorization: "Bearer secret-provider-1234" });
			return Response.json({ data: [] });
		}),
	});
	expect(result).toMatchObject({ ok: true, balance: null, detail: null });
});

for (const [status, detail] of [
	[401, "The provider refused the key."],
	[403, "The provider refused the request."],
	[500, "The provider answered HTTP 500."],
] as const) {
	test(`maps HTTP ${status} without the echoed header`, async () => {
		const h = remoteHarness(db);
		const provider = await h.create();
		const result = await prepareCheck(h.ctx, provider, {
			now: h.now,
			fetch: h.fetch(async (_url, init) => new Response(JSON.stringify(init.headers), { status })),
		});
		expect(result).toMatchObject({ ok: false, balance: null, detail });
		expect(ProviderCheckSchema.parse(result)).toEqual(result);
		expect(JSON.stringify([result, h.logs])).not.toContain("secret-provider-1234");
		expect(JSON.stringify(h.logs)).not.toContain("Authorization");
	});
}

for (const failure of ["network", "timeout", "json", "shape", "echo"] as const) {
	test(`maps ${failure} to a safe check failure`, async () => {
		const h = remoteHarness(db);
		const key = "secret-provider-1234";
		const provider = await h.create();
		const result = await prepareCheck(h.ctx, provider, {
			now: h.now,
			fetch: h.fetch(async () => {
				if (failure === "network") throw new Error(key);
				if (failure === "timeout") throw new DOMException(key, "TimeoutError");
				if (failure === "json") return new Response(key);
				if (failure === "shape") return Response.json({ error: key });
				return Response.json({ balance: key });
			}),
		});
		expect(result).toMatchObject({ ok: false, balance: null, detail: "Trellis cannot reach ai-gateway.vercel.sh." });
		expect(JSON.stringify([result, h.logs])).not.toContain(key);
	});
}

test("caches failed checks for thirty seconds with a one-second refresh floor", async () => {
	const h = remoteHarness(db);
	const provider = await h.create();
	let calls = 0;
	const deps = {
		now: h.now,
		fetch: h.fetch(async () => {
			calls++;
			return new Response(null, { status: 401 });
		}),
	};
	await prepareCheck(h.ctx, provider, deps);
	h.advance(999);
	await prepareCheck(h.ctx, { id: provider.id, refresh: true }, deps);
	expect(calls).toBe(1);
	h.advance(1);
	await prepareCheck(h.ctx, { id: provider.id, refresh: true }, deps);
	expect(calls).toBe(2);
	h.advance(29_999);
	await prepareCheck(h.ctx, provider, deps);
	expect(calls).toBe(2);
	h.advance(1);
	await prepareCheck(h.ctx, provider, deps);
	expect(calls).toBe(3);
});

test("clears both caches after each committed provider update and delete", async () => {
	const h = remoteHarness(db);
	const provider = await h.create();
	let calls = 0;
	const deps = {
		now: h.now,
		fetch: h.fetch(async () => {
			calls++;
			return Response.json({ data: [], balance: "10.00" });
		}),
	};
	const read = async () => {
		await prepareModels(h.ctx, provider, deps);
		await prepareCheck(h.ctx, provider, deps);
	};
	await read();
	for (const fields of [
		{ baseUrl: "https://example.com" },
		{ apiKey: "new-secret-provider" },
		{ models: ["model"] },
		{ enabled: false },
	]) {
		const before = calls;
		await db.transaction((tx) => update(h.ctx, tx, { id: provider.id, ...fields }));
		await read();
		expect(calls).toBe(before);
		await h.commit();
		await read();
		expect(calls).toBe(before + 2);
	}
	await db.transaction((tx) => remove(h.ctx, tx, { id: provider.id }));
	await h.commit();
	await expect(prepareCheck(h.ctx, provider, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
	await expect(prepareModels(h.ctx, provider, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("an old request cannot replace the cache after a key update", async () => {
	const h = remoteHarness(db);
	const provider = await h.create();
	const pending = Promise.withResolvers<Response>();
	const started = Promise.withResolvers<void>();
	const old = prepareCheck(h.ctx, provider, {
		now: h.now,
		fetch: h.fetch(async () => {
			started.resolve();
			return pending.promise;
		}),
	});
	await started.promise;
	await db.transaction((tx) => update(h.ctx, tx, { id: provider.id, apiKey: "new-secret-provider" }));
	await h.commit();
	let calls = 0;
	const deps = {
		now: h.now,
		fetch: h.fetch(async (_url, init) => {
			calls++;
			expect(init.headers).toEqual({ Authorization: "Bearer new-secret-provider" });
			return Response.json({ balance: "20.00" });
		}),
	};
	expect(await prepareCheck(h.ctx, provider, deps)).toMatchObject({ balance: "20.00" });
	pending.resolve(Response.json({ balance: "10.00" }));
	await old;
	expect(await prepareCheck(h.ctx, provider, deps)).toMatchObject({ balance: "20.00" });
	expect(calls).toBe(1);
});
