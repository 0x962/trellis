import { afterAll, expect, test } from "bun:test";
import type { FlowDocumentSaveV1Input } from "@trellis/api";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "window", {
	configurable: true,
	value: { location: { origin: "http://localhost:4521" } },
});
Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: { getItem: () => JSON.stringify({ name: "Navid", kind: "human" }) },
});
const { createOrpc } = await import("./orpc");

afterAll(() => {
	if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
	else Reflect.deleteProperty(globalThis, "window");
	if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
	else Reflect.deleteProperty(globalThis, "localStorage");
});

test("session issuance and scoped saves stay separate while ordinary calls share a batch", async () => {
	const requests: Request[] = [];
	const { client } = createOrpc({
		baseUrl: "http://localhost:4521",
		fetch: (request) => {
			requests.push(request);
			return Response.json({ defined: false, code: "FORBIDDEN", status: 403, message: "Refused" }, { status: 403 });
		},
	});
	const input: FlowDocumentSaveV1Input = {
		flow: "review",
		expectedVersion: 1,
		requestId: "00000000-0000-4000-8000-000000000001",
		schemaVersion: 1,
		engine: "langflow",
		graphDocument: { nodes: [], edges: [] },
		componentManifestHash: "a".repeat(64),
	};
	const results = await Promise.allSettled([
		client.flowDocumentsV1.editorSession({ flow: input.flow, expectedVersion: 1 }),
		client.flowDocumentsV1.save(input, { context: { editorChannel: "first" } }),
		client.flowDocumentsV1.save(input, { context: { editorChannel: "second" } }),
		client.flowDocumentsV1.save(input),
		client.flowDocumentsV1.get({ flow: input.flow }),
	]);
	expect(results.every((result) => result.status === "rejected")).toBe(true);
	expect(requests).toHaveLength(4);
	expect(requests.filter((request) => request.url.endsWith("/rpc/__batch__"))).toHaveLength(1);
	const saves = requests.filter((request) => request.url.endsWith("/flowDocumentsV1/save"));
	expect(saves.map((request) => request.headers.get("x-trellis-editor-channel"))).toEqual(["first", "second"]);
	const session = requests.find((request) => request.url.endsWith("/flowDocumentsV1/editorSession"));
	expect(session).toBeDefined();
	expect(session?.headers.get("x-trellis-editor-channel")).toBeNull();
	const batch = requests.find((request) => request.url.endsWith("/rpc/__batch__"));
	expect(batch?.headers.get("x-trellis-editor-channel")).toBeNull();
	expect(requests.every((request) => request.headers.get("x-trellis-actor") === "human:Navid")).toBe(true);
});
