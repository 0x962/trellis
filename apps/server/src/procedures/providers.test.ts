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
