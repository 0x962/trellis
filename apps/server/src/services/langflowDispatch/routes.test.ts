import { afterAll, beforeAll, expect, test } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import { FlowDocumentV1Schema, FlowExecutionViewV1Schema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceTransport } from "../../db/transport.ts";
import type { GhAccess } from "../../ghState.ts";
import { type ProcedureContext, router } from "../../procedures/index.ts";
import { createDbTiming } from "../../serverTiming.ts";
import { services } from "../registry.ts";
import { fixture } from "./fixture";

let h: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
	h = await fixture();
});
afterAll(async () => {
	await h.db.$client.close();
});
const handler = new OpenAPIHandler<ProcedureContext>(router, { plugins: [new ResponseHeadersPlugin()] });
const rpcHandler = new RPCHandler<ProcedureContext>(router);
const calls: string[] = [];
const request = async (path: string, init: RequestInit = {}, rpc = false) => {
	const prefix = rpc ? "/rpc" : "/api";
	const raw = new Request(`http://localhost${prefix}${path}`, init);
	const call: ServiceTransport["call"] = async (name, ctx, input) => {
		calls.push(name);
		const entry = services[name];
		if (entry.family !== "core") throw new Error(`Expected a core service: ${name}`);
		return h.db.transaction((tx) => entry.run({ ...h.ctx, ...ctx }, tx, input));
	};
	const result = await (rpc ? rpcHandler : handler).handle(raw, {
		prefix,
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
		{ id: h.view.id, engine: "langflow", flowId: h.view.flowId, status: h.view.status, pendingSubmission: false },
		{
			id: h.legacy.id,
			engine: "legacy",
			flowId: h.legacy.flowId,
			status: h.legacy.state.status,
			pendingSubmission: false,
		},
	]);
	const next = await request("/flow-executions/index-v1?limit=501&offset=1");
	expect(next.status).toBe(200);
	expect(await next.json()).toEqual([
		{
			id: h.legacy.id,
			engine: "legacy",
			flowId: h.legacy.flowId,
			status: h.legacy.state.status,
			pendingSubmission: false,
		},
	]);
	for (const query of [
		"limit=0",
		"limit=1.5",
		"offset=-1",
		"offset=invalid",
		"offset=",
		"limit=",
		"offset=%20",
		"limit=true",
	]) {
		const invalid = await request(`/flow-executions/index-v1?${query}`);
		expect(invalid.status).toBe(400);
	}
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

test("conditional saves reject stale and excluded representations before a document write", async () => {
	const before = await request("/flows/review/document-v1");
	const document = FlowDocumentV1Schema.parse(await before.json());
	const etag = before.headers.get("etag")!;
	expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
	for (const [header, value] of [
		["if-match", '"0"'],
		["if-match", `W/${etag}`],
		["if-none-match", "*"],
		["if-none-match", `"0", W/${etag}`],
	] as const) {
		const response = await request("/flows/review/document-v1", {
			method: "PUT",
			headers: { "content-type": "application/json", "x-trellis-actor": "human:fixture", [header]: value },
			body: JSON.stringify({
				flow: "review",
				schemaVersion: 1,
				engine: "langflow",
				expectedVersion: document.revision,
				requestId: crypto.randomUUID(),
				graphDocument: {},
				componentManifestHash: document.componentManifestHash,
			}),
		});
		expect(response.status).toBe(412);
	}
	const after = await request("/flows/review/document-v1");
	expect(await after.json()).toEqual(document);
});

test("the RPC handler rejects pagination types that are not integers or decimal strings", async () => {
	for (const json of [{ limit: true }, { offset: null }, { offset: false }, { limit: [501] }, { offset: "" }]) {
		const before = calls.length;
		const response = await request(
			"/flowDocumentsV1/list",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ json }),
			},
			true,
		);
		expect(response.status).toBe(400);
		expect(calls).toHaveLength(before);
	}
	for (const json of [
		{ limit: 501, offset: 0 },
		{ limit: "501", offset: "0" },
	]) {
		const response = await request(
			"/flowDocumentsV1/list",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ json }),
			},
			true,
		);
		expect(response.status).toBe(200);
	}
});

test("retained output requires the exact archived attempt and result", async () => {
	const binding = {
		executionId: h.legacy.id,
		stepId: h.legacy.state.steps[0]!.actionKey!,
		agentRunId: "00000000000000000000000042",
		attemptId: "archived-attempt",
		resultId: "archived-result",
	};
	await h.db.execute(sql`INSERT INTO flow_execution_tasks VALUES (
		${binding.executionId}, ${binding.stepId}, ${binding.agentRunId}, ${binding.attemptId}, ${binding.resultId}, now()
	)`);
	for (const input of [
		binding,
		{ ...binding, attemptId: "another-attempt" },
		{ ...binding, resultId: "another-result" },
	]) {
		const query = new URLSearchParams(input);
		query.delete("executionId");
		const response = await request(`/flow-executions/${input.executionId}/output-v1?${query}`);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			...input,
			output: input === binding ? h.legacy.state.steps[0]!.output : null,
		});
	}
});
