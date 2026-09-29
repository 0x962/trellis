import { afterAll, beforeAll, expect, test } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { FlowDocumentV1Schema, FlowExecutionViewV1Schema } from "@trellis/api";
import type { ServiceTransport } from "../../db/transport.ts";
import type { GhAccess } from "../../ghState.ts";
import { type ProcedureContext, router } from "../../procedures/index.ts";
import { createDbTiming } from "../../serverTiming.ts";
import { services } from "../registry.ts";
import { fixture } from "./fixture.ts";

let h: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
	h = await fixture();
});
afterAll(async () => {
	await h.db.$client.close();
});
const handler = new OpenAPIHandler<ProcedureContext>(router);
const calls: string[] = [];
const request = async (path: string, init: RequestInit = {}) => {
	const raw = new Request(`http://localhost/api${path}`, init);
	const call: ServiceTransport["call"] = async (name, ctx, input) => {
		calls.push(name);
		const entry = services[name];
		if (entry.family !== "core") throw new Error(`Expected a core service: ${name}`);
		return h.db.transaction((tx) => entry.run({ ...h.ctx, ...ctx }, tx, input));
	};
	const result = await handler.handle(raw, {
		prefix: "/api",
		context: {
			headers: raw.headers,
			reqId: "composition-http",
			transport: { call } as ServiceTransport,
			actor: null,
			timing: createDbTiming(),
			chooseDirectory: async () => null,
			gh: {} as GhAccess,
		},
	});
	expect(result.matched).toBe(true);
	return result.response!;
};

test("the shared HTTP router calls the registered document and immutable execution readers", async () => {
	const doc = await request("/flows/review/document-v1");
	expect(doc.status).toBe(200);
	expect(FlowDocumentV1Schema.parse(await doc.json()).engine).toBe("langflow");
	for (const [id, engine] of [
		[h.legacy.id, "legacy"],
		[h.view.id, "langflow"],
	] as const) {
		const response = await request(`/flow-executions/${id}/view-v1`);
		expect(response.status).toBe(200);
		expect(FlowExecutionViewV1Schema.parse(await response.json()).engine).toBe(engine);
	}
	const index = await request("/flow-executions/index-v1?limit=501");
	expect(index.status).toBe(200);
	expect(await index.json()).toEqual([
		{ id: h.view.id, engine: "langflow" },
		{ id: h.legacy.id, engine: "legacy" },
	]);
	expect(calls).toContain("flowDocuments.get");
	expect(calls).toContain("flowDocuments.view");
	expect(calls).toContain("flowDocuments.list");
});

test("versioned saves require an actor before transport and retain declared validation errors", async () => {
	const before = calls.length;
	const missing = await request("/flows/review/document-v1", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: "{}",
	});
	expect((await missing.json()).code).toBe("ACTOR_REQUIRED");
	const invalid = await request("/flows/review/document-v1", {
		method: "PUT",
		headers: { "content-type": "application/json", "x-trellis-actor": "human:fixture" },
		body: "{}",
	});
	expect((await invalid.json()).code).toBe("INPUT_VALIDATION_FAILED");
	expect(calls).toHaveLength(before);
});

test("legacy document requests return the versioned endpoint instead of a substituted schema", async () => {
	const response = await request("/flows/review");
	expect(response.status).toBe(422);
	expect(await response.json()).toMatchObject({
		code: "FLOW_UNSUPPORTED_FORMAT",
		data: { engine: "langflow", supportedEndpoint: `/api/flows/${h.input.flowId}/document-v1` },
	});
});
