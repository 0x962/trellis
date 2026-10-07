import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import type { Provider } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../db/testDb.ts";
import type { ServiceTransport } from "../db/transport.ts";
import type { GhAccess } from "../ghState.ts";
import { createDbTiming } from "../serverTiming.ts";
import { prepareDraftCheck } from "../services/providers/draftCheck.ts";
import { create as createProvider, update as updateProvider } from "../services/providers/providers.ts";
import type { ServiceName } from "../services/registry.ts";
import type { IoCtx } from "../services/support.ts";
import { type ProcedureContext, router } from "./index.ts";

type Call = (name: ServiceName, ctx: Parameters<ServiceTransport["call"]>[1], input: unknown) => Promise<unknown>;

const handler = new OpenAPIHandler<ProcedureContext>(router, {
	plugins: [new ResponseHeadersPlugin<ProcedureContext>()],
});

const request = async (path: string, init: RequestInit, call: Call) => {
	const raw = new Request(`http://trellis.test/api${path}`, init);
	const context: ProcedureContext = {
		headers: raw.headers,
		reqId: ulid(),
		transport: { call } as ServiceTransport,
		actor: null,
		timing: createDbTiming(),
		chooseDirectory: async () => null,
		gh: {} as GhAccess,
	};
	const result = await handler.handle(raw, { prefix: "/api", context });
	expect(result.matched).toBe(true);
	return result.response!;
};

const json = (body: unknown) => ({
	headers: { "content-type": "application/json", "x-trellis-actor": "human:navidkhan" },
	body: JSON.stringify(body),
});

let db: Awaited<ReturnType<typeof openTestDb>>;

beforeAll(async () => {
	db = await openTestDb();
}, 30_000);

beforeEach(async () => {
	await db.execute(sql`DELETE FROM providers`);
});

afterAll(async () => {
	await db.$client.close();
});

describe("Provider procedures", () => {
	test("normalizes each request base URL once", async () => {
		const call: Call = (name, ctx, input) =>
			db.transaction((tx) => {
				const serviceCtx = {
					actor: ctx.actor,
					afterCommit: () => {},
					now: () => ctx.now,
					emit: () => undefined,
				} as unknown as IoCtx;
				if (name === "providers.create") return createProvider(serviceCtx, tx, input);
				if (name === "providers.update") return updateProvider(serviceCtx, tx, input);
				throw new Error(`Unexpected service: ${name}`);
			});

		const createResponse = await request(
			"/providers",
			{
				method: "POST",
				...json({
					name: "Nested path",
					kind: "openai-compatible",
					baseUrl: "https://api.example.com/v1/v1/",
					apiKey: "provider-secret",
				}),
			},
			call,
		);
		expect(createResponse.status).toBe(201);
		const created = (await createResponse.json()) as Provider;
		expect(created.baseUrl).toBe("https://api.example.com/v1");

		const updateResponse = await request(
			`/providers/${created.id}`,
			{
				method: "PATCH",
				...json({ baseUrl: "https://api.example.com/v1/v1/v1/" }),
			},
			call,
		);
		expect(updateResponse.status).toBe(200);
		const updated = (await updateResponse.json()) as Provider;
		expect(updated.baseUrl).toBe("https://api.example.com/v1/v1");
	});
});

test("routes catalogs and checks with a boolean refresh input", async () => {
	const id = ulid();
	for (const [path, name, input, result] of [
		[
			`/providers/${id}/models?refresh=true`,
			"providers.models",
			{ id, refresh: true },
			{ ok: true, detail: null, models: [], fetchedAt: "2026-09-24T20:00:00.000Z" },
		],
		[
			"/providers/kinds/openai-compatible/models?refresh=false",
			"providers.publicModels",
			{ kind: "openai-compatible", refresh: false },
			{ ok: true, detail: null, models: [], fetchedAt: "2026-09-24T20:00:00.000Z" },
		],
		[
			`/providers/${id}/check?refresh=true`,
			"providers.check",
			{ id, refresh: true },
			{ ok: false, detail: "The provider refused the key.", balance: null, checkedAt: "2026-09-24T20:00:00.000Z" },
		],
	] as const) {
		const response = await request(path, { method: "GET" }, async (actualName, _ctx, actualInput) => {
			expect(actualName).toBe(name);
			expect(actualInput).toEqual(input);
			return result;
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(result);
	}
});
test("routes an unsaved credential to the draft checker without a provider record", async () => {
	const key = "synthetic-draft-key-9876";
	for (const status of [200, 401]) {
		const logs: unknown[] = [];
		const response = await request(
			"/providers/check-draft",
			{
				method: "POST",
				...json({ kind: "vercel-ai-gateway", apiKey: ` ${key} ` }),
			},
			async (name, _ctx, input) => {
				expect(name).toBe("providers.checkDraft");
				expect(input).toEqual({ kind: "vercel-ai-gateway", apiKey: key, baseUrl: "https://ai-gateway.vercel.sh" });
				return prepareDraftCheck(
					{
						log: (...data: unknown[]) => logs.push(data),
						newTx: () => {
							throw new Error("The draft cannot access the database.");
						},
					} as unknown as IoCtx,
					input,
					{
						now: () => Date.parse("2026-10-06T12:00:00.000Z"),
						fetch: async () => (status === 200 ? Response.json({ balance: "9.00" }) : new Response(key, { status })),
					},
				);
			},
		);
		expect(response.status).toBe(200);
		const result = await response.json();
		expect(result).toEqual({
			ok: status === 200,
			balance: status === 200 ? "9.00" : null,
			detail: status === 200 ? null : "The provider refused the key.",
			checkedAt: "2026-10-06T12:00:00.000Z",
		});
		expect(JSON.stringify([result, logs])).not.toContain(key);
	}
	const providers = await db.execute(sql`SELECT id FROM providers`);
	const models = await db.execute(sql`SELECT provider_id FROM provider_models`);
	expect(providers.rows).toHaveLength(0);
	expect(models.rows).toHaveLength(0);
});

test("rejects invalid draft requests before the service and does not echo the key", async () => {
	let calls = 0;
	const key = "synthetic-private-draft-key";
	for (const fields of [
		{ apiKey: "" },
		{ apiKey: " " },
		{ baseUrl: undefined },
		{ baseUrl: "http://provider.example" },
		{ baseUrl: "https://user:password@provider.example" },
		{ baseUrl: "https://provider.example?query" },
		{ baseUrl: "https://provider.example#fragment" },
		{ id: "unsaved" },
	]) {
		const response = await request(
			"/providers/check-draft",
			{
				method: "POST",
				...json({ kind: "openai-compatible", apiKey: key, baseUrl: "https://provider.example", ...fields }),
			},
			async () => {
				calls++;
				throw new Error("Invalid input cannot reach the service.");
			},
		);
		expect(response.status).toBe(400);
		const body = await response.text();
		expect(body).toContain("INPUT_VALIDATION_FAILED");
		expect(body).not.toContain(key);
	}
	expect(calls).toBe(0);
});
