import { expect, test } from "bun:test";
import { clientVersion, createTrellisClient } from "./client";
import type { FlowDocumentSaveV1Input } from "./schemas/flowDocumentV1";

const input: FlowDocumentSaveV1Input = {
	flow: "review",
	expectedVersion: 1,
	requestId: "00000000-0000-4000-8000-000000000001",
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: { nodes: [], edges: [] },
	componentManifestHash: "a".repeat(64),
};

test("concurrent saves retain their own editor channel and exact request bytes", async () => {
	const requests: Request[] = [];
	const client = createTrellisClient("http://localhost:4521", "human:Navid", (request) => {
		requests.push(request);
		return Response.json({ json: null });
	});
	await Promise.all([
		client.flowDocumentsV1.save(input, { context: { editorChannel: "first" } }),
		client.flowDocumentsV1.save(input, { context: { editorChannel: "second" } }),
		client.flowDocumentsV1.save(input),
	]);
	expect(requests.map((request) => request.headers.get("x-trellis-editor-channel"))).toEqual(["first", "second", null]);
	for (const request of requests) {
		expect(request.headers.get("x-trellis-actor")).toBe("human:Navid");
		expect(request.headers.get("x-trellis-client")).toBe(clientVersion);
		expect(await request.json()).toEqual({ json: input });
	}
});

test("actor changes apply per request without carrying channels to other methods", async () => {
	let actor: string | null = "human:Navid";
	const requests: Request[] = [];
	const client = createTrellisClient(
		"http://localhost:4521",
		() => actor,
		(request) => {
			requests.push(request);
			return Response.json({ json: null });
		},
	);
	await client.flowDocumentsV1.save(input, { context: { editorChannel: "first" } });
	actor = "human:Other";
	await client.flowDocumentsV1.get({ flow: input.flow }, { context: { editorChannel: "first" } });
	actor = null;
	await client.flowDocumentsV1.save(input);
	expect(requests.map((request) => request.headers.get("x-trellis-actor"))).toEqual([
		"human:Navid",
		"human:Other",
		null,
	]);
	expect(requests.map((request) => request.headers.get("x-trellis-editor-channel"))).toEqual(["first", null, null]);
	expect(requests.every((request) => request.headers.get("x-trellis-client") === clientVersion)).toBe(true);
});
