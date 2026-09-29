import { expect, test } from "bun:test";
import { openEditorReads } from "./scopedReads";

const identity = {
	host: "host/data-home",
	actor: "human:editor",
	flowId: "flow-1",
	revision: 2,
	documentHash: "a".repeat(64),
	componentManifestHash: "b".repeat(64),
};
const bootstrap = {
	channel: "b28466dd-b7bc-4020-98b1-191a3b0e64a9",
	identity,
	project: "TRL",
	parentOrigin: "http://localhost:4521",
	expiresAt: new Date(1000).toISOString(),
};
const document = {
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: { nodes: [], edges: [] },
	componentManifestHash: identity.componentManifestHash,
	revision: 2,
	documentHash: identity.documentHash,
	flow: { id: identity.flowId, name: "Review", description: "", project: "TRL" },
};
function fixture() {
	const requests: { url: string; init: RequestInit }[] = [];
	let next: unknown = document;
	let now = 0;
	const read = (async (url: string | URL | Request, init: RequestInit) => {
		requests.push({ url: String(url), init });
		return Response.json(requests.length === 1 ? bootstrap : next);
	}) as typeof fetch;
	return {
		requests,
		open: () =>
			openEditorReads({
				channel: bootstrap.channel,
				origin: "http://localhost:4172",
				flowId: identity.flowId,
				fetch: read,
				now: () => now,
			}),
		next: (value: unknown) => {
			next = value;
		},
		expire: () => {
			now = 1000;
		},
	};
}

test("uses scoped cookie reads with exact immutable identity and project headers", async () => {
	const f = fixture();
	const reads = await f.open();
	expect(await reads.document()).toEqual(document);
	f.next({ ...document, revision: 3, documentHash: "c".repeat(64) });
	await reads.document();
	for (const request of f.requests) {
		expect(request.url).toStartWith(`http://localhost:4172/api/trellis-editor/v1/sessions/${bootstrap.channel}/`);
		expect(request.init.method).toBe("GET");
		expect(request.init.credentials).toBe("same-origin");
		expect(request.init.referrerPolicy).toBe("origin");
		expect(request.init.redirect).toBe("error");
	}
	expect(f.requests[0]!.init.headers).toBeUndefined();
	for (const request of f.requests.slice(1))
		expect(request.init.headers).toEqual({
			"x-trellis-editor-identity": JSON.stringify(identity),
			"x-trellis-editor-project": "TRL",
		});
	f.expire();
	await expect(reads.document()).rejects.toThrow("expired");
	expect(f.requests).toHaveLength(3);
});

test("rejects another document scope and retains blocked catalog entries", async () => {
	const f = fixture();
	const reads = await f.open();
	f.next({ ...document, flow: { ...document.flow, project: "OTHER" } });
	await expect(reads.document()).rejects.toThrow("grant");
	f.next({
		schemaVersion: 1,
		catalogId: "trellis-components-v1",
		engine: { name: "langflow", version: "1.12.3", commit: "pinned" },
		definitions: [{ id: "native", className: "Native", allowedForPublication: false, frontendTemplate: null }],
	});
	const catalog = await reads.catalog();
	expect(catalog.definitions[0]).toEqual({
		id: "native",
		className: "Native",
		allowedForPublication: false,
		frontendTemplate: null,
	});
});
