import { expect, test } from "bun:test";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createTrellisClient } from "../client.ts";
import type { FlowExecutionViewV1 } from "../schemas/flowExecutionViewV1.ts";
import {
	executionViewV1Example,
	flowV1FixtureIds,
	flowV1RequestId,
	pendingDocumentV1Example,
} from "../schemas/flowV1Fixtures.ts";
import { clientContract, contract, flowDocumentsV1 } from "./index.ts";

test("the client and server share versioned routes and retain strict legacy contracts", () => {
	expect(clientContract).toBe(contract);
	expect(clientContract.flows).toBe(contract.flows);
	expect(clientContract.flowExecutions).toBe(contract.flowExecutions);
	for (const name of ["get", "save", "view"] as const) {
		expect(clientContract.flowDocumentsV1[name]["~orpc"].route).toEqual({
			...flowDocumentsV1[name]["~orpc"].route,
			tags: ["flow documents v1"],
		});
		expect(clientContract.flowDocumentsV1[name]["~orpc"].outputSchema).toBe(
			flowDocumentsV1[name]["~orpc"].outputSchema,
		);
	}
});

test("the versioned execution index accepts pagination beyond the legacy cutoff", async () => {
	const entries = [{ id: flowV1FixtureIds.execution, engine: "langflow" as const }];
	const client = createTrellisClient("http://localhost", "human:reviewer", async (request) => {
		expect(new URL(request.url).pathname).toBe("/rpc/flowDocumentsV1/list");
		return Response.json({ json: entries });
	});
	expect(await client.flowDocumentsV1.list({ limit: 501, offset: 500 })).toEqual(entries);
	expect(contract.flowDocumentsV1.list["~orpc"].inputSchema!.parse({ limit: 501 }).limit).toBe(501);
});

test("versioned reads use the shared typed RPC client and actor headers", async () => {
	const requests: Request[] = [];
	const client = createTrellisClient("http://localhost:4521", "human:reviewer", async (request) => {
		requests.push(request);
		return Response.json({
			json: request.url.endsWith("/view") ? executionViewV1Example : pendingDocumentV1Example,
		});
	});
	const document = await client.flowDocumentsV1.get({ flow: "review" });
	const view: FlowExecutionViewV1 = await client.flowDocumentsV1.view({ id: flowV1FixtureIds.execution });
	expect(document).toEqual(pendingDocumentV1Example);
	expect(view).toEqual(executionViewV1Example);
	expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
		"/rpc/flowDocumentsV1/get",
		"/rpc/flowDocumentsV1/view",
	]);
	for (const request of requests) expect(request.headers.get("x-trellis-actor")).toBe("human:reviewer");
	const queries = createTanstackQueryUtils(client);
	expect(queries.flowDocumentsV1.view.queryOptions({ input: { id: view.id } }).queryKey).toContainEqual([
		"flowDocumentsV1",
		"view",
	]);
});

test("versioned saves carry the full document and request identity through the shared client", async () => {
	const input = {
		flow: "review",
		schemaVersion: 1 as const,
		engine: "langflow" as const,
		graphDocument: { text: "x".repeat(100_001), nodes: Array.from({ length: 501 }, (_, id) => ({ id })) },
		componentManifestHash: pendingDocumentV1Example.componentManifestHash,
		expectedVersion: 1,
		requestId: flowV1RequestId,
	};
	let body: unknown;
	const client = createTrellisClient("http://localhost:4521", "human:reviewer", async (request) => {
		body = await request.json();
		expect(new URL(request.url).pathname).toBe("/rpc/flowDocumentsV1/save");
		return Response.json({ json: pendingDocumentV1Example });
	});
	await client.flowDocumentsV1.save(input);
	expect(body).toEqual({ json: input });
});
