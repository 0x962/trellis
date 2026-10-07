import { expect, test } from "bun:test";
import { ProviderCheckSchema } from "@trellis/api";
import type { IoCtx } from "../support.ts";
import { prepareDraftCheck } from "./draftCheck.ts";
import type { ProviderFetch } from "./remote.ts";

const key = "synthetic-draft-key-1234";
const checkedAt = "2026-10-06T12:00:00.000Z";
const harness = () => {
	const logs: unknown[] = [];
	const ctx = {
		log: (...data: unknown[]) => logs.push(data),
		newTx: () => {
			throw new Error("A draft check cannot access the database.");
		},
		emit: () => {
			throw new Error("A draft check cannot emit an event.");
		},
		afterCommit: () => {
			throw new Error("A draft check cannot schedule a write.");
		},
	} as unknown as IoCtx;
	return { ctx, logs, now: () => Date.parse(checkedAt) };
};

test("checks each unsaved gateway key without a transaction or cache", async () => {
	const h = harness();
	let calls = 0;
	const fetcher: ProviderFetch = async (url, init) => {
		calls++;
		expect(url).toBe("https://ai-gateway.vercel.sh/v1/credits");
		expect(init.method).toBe("GET");
		expect(init.headers).toEqual({ Authorization: `Bearer ${key}` });
		expect(init.body).toBeUndefined();
		expect(init.redirect).toBe("manual");
		expect(init.signal).toBeInstanceOf(AbortSignal);
		return Response.json({ balance: "12.5000" });
	};
	for (let attempt = 0; attempt < 2; attempt++) {
		const result = await prepareDraftCheck(
			h.ctx,
			{ kind: "vercel-ai-gateway", apiKey: `  ${key}  ` },
			{ now: h.now, fetch: fetcher },
		);
		expect(result).toEqual({ ok: true, balance: "12.5000", detail: null, checkedAt });
		expect(ProviderCheckSchema.parse(result)).toEqual(result);
		expect(JSON.stringify([result, h.logs])).not.toContain(key);
	}
	expect(calls).toBe(2);
});

test("normalizes a compatible draft URL once and returns no balance", async () => {
	const h = harness();
	const result = await prepareDraftCheck(
		h.ctx,
		{
			kind: "openai-compatible",
			apiKey: key,
			baseUrl: " https://provider.example/v1/v1/ ",
		},
		{
			now: h.now,
			fetch: async (url, init) => {
				expect(url).toBe("https://provider.example/v1/v1/models");
				expect(init.headers).toEqual({ Authorization: `Bearer ${key}` });
				return Response.json({ data: [] });
			},
		},
	);
	expect(result).toEqual({ ok: true, balance: null, detail: null, checkedAt });
});

for (const [status, detail] of [
	[401, "The provider refused the key."],
	[403, "The provider refused the request."],
	[500, "The provider answered HTTP 500."],
] as const)
	test(`maps draft HTTP ${status} without secret response text`, async () => {
		const h = harness();
		const result = await prepareDraftCheck(
			h.ctx,
			{ kind: "vercel-ai-gateway", apiKey: key },
			{
				now: h.now,
				fetch: async () => new Response(key, { status }),
			},
		);
		expect(result).toEqual({ ok: false, balance: null, detail, checkedAt });
		expect(ProviderCheckSchema.parse(result)).toEqual(result);
		expect(JSON.stringify([result, h.logs])).not.toContain(key);
	});

for (const failure of ["network", "timeout", "json", "shape", "echo"] as const)
	test(`maps draft ${failure} to the saved check failure shape`, async () => {
		const h = harness();
		const numericKey = "1234567890123456";
		const result = await prepareDraftCheck(
			h.ctx,
			{ kind: "vercel-ai-gateway", apiKey: numericKey },
			{
				now: h.now,
				fetch: async () => {
					if (failure === "network") throw new Error(numericKey);
					if (failure === "timeout") throw new DOMException(numericKey, "TimeoutError");
					if (failure === "json") return new Response(`${numericKey} secret`);
					if (failure === "shape") return Response.json({ error: numericKey });
					return Response.json({ balance: numericKey });
				},
			},
		);
		expect(result).toEqual({
			ok: false,
			balance: null,
			detail: "Trellis cannot reach ai-gateway.vercel.sh.",
			checkedAt,
		});
		expect(ProviderCheckSchema.parse(result)).toEqual(result);
		expect(JSON.stringify([result, h.logs])).not.toContain(numericKey);
	});

test("rejects invalid draft input before any external call", () => {
	const h = harness();
	let calls = 0;
	for (const patch of [
		{ apiKey: " " },
		{ baseUrl: "http://provider.example" },
		{ baseUrl: undefined },
		{ id: "unsaved" },
	]) {
		expect(() =>
			prepareDraftCheck(
				h.ctx,
				{ kind: "openai-compatible", apiKey: key, baseUrl: "https://provider.example", ...patch },
				{
					now: h.now,
					fetch: async () => {
						calls++;
						return Response.json({ data: [] });
					},
				},
			),
		).toThrow();
	}
	expect(calls).toBe(0);
	expect(h.logs).toEqual([]);
});
