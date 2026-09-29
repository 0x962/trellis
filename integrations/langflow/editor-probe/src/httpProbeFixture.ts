import { flowV1Digest, flowV1FixtureIds } from "../../../../packages/api/src/schemas/flowV1Fixtures.ts";
import { editorGraphFixture } from "./fixtures.ts";
import { type GatewayEvidenceEvent, probeSessionCookie } from "./gatewayProtocol.ts";
import { langflowGraphFixture } from "./langflowGraphFixture.ts";

// This standalone client runs outside Turbo and receives the loopback gateway address from the process owner.
// biome-ignore lint/suspicious/noUndeclaredEnvVars: The probe does not run through a cached Turbo task.
const origin = process.env.TRL_EDITOR_ORIGIN!;
const headers = { cookie: probeSessionCookie, "content-type": "application/json" };

const request = (path: string, init: RequestInit = {}) => fetch(`${origin}${path}`, { ...init, headers });

const expectStatus = async (response: Response, status: number) => {
	if (response.status !== status) {
		throw new Error(`${response.url} returned ${response.status}; expected ${status}.`);
	}
	return response;
};

const readJson = async (response: Response, status: number) => (await expectStatus(response, status)).json();

const initialDocument = await readJson(await request("/api/trellis-editor/v1/document"), 200);
await expectStatus(await fetch(`${origin}/api/trellis-editor/v1/document`), 401);
await expectStatus(await request("/api/v1/flows/another-flow"), 403);
await expectStatus(await request("/api/v1/flows/another-flow/history"), 404);
await expectStatus(await request("/api/trellis-editor/v1/component-manifest"), 200);
await expectStatus(await request("/api/v1/all?force_refresh=true"), 200);
await expectStatus(await request(`/api/v1/flows/${flowV1FixtureIds.flow}`), 200);

for (const path of [
	"/api/v1/run/probe",
	"/api/v1/build/probe/flow",
	"/api/v1/validate/code",
	"/api/v1/flows/upload",
	"/api/v1/variables",
	"/api/v2/workflows/probe",
]) {
	await expectStatus(await request(path, { method: "POST", body: "{}" }), 403);
}

const wrongFlowBody = JSON.stringify({
	flow: "00000000000000000000000999",
	expectedVersion: initialDocument.revision,
	requestId: "5a29b654-19e3-4a9c-b1e1-f50e4e5443da",
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: langflowGraphFixture,
	componentManifestHash: flowV1Digest,
});
await expectStatus(await request("/api/trellis-editor/v1/document", { method: "PUT", body: wrongFlowBody }), 403);

const wrongManifestBody = JSON.stringify({
	flow: flowV1FixtureIds.flow,
	expectedVersion: initialDocument.revision,
	requestId: "49dc4492-a38f-4436-9690-bdc2f950e66e",
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: langflowGraphFixture,
	componentManifestHash: "b".repeat(64),
});
await expectStatus(await request("/api/trellis-editor/v1/document", { method: "PUT", body: wrongManifestBody }), 403);

const alteredComponentGraph = structuredClone(langflowGraphFixture);
alteredComponentGraph.nodes[0]!.data.node.description = "Replacement component definition.";
const alteredComponentBody = JSON.stringify({
	flow: flowV1FixtureIds.flow,
	expectedVersion: initialDocument.revision,
	requestId: "4ae2c220-2197-46d2-9c7a-00d564d6f89e",
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: alteredComponentGraph,
	componentManifestHash: flowV1Digest,
});
await expectStatus(
	await request("/api/trellis-editor/v1/document", { method: "PUT", body: alteredComponentBody }),
	403,
);

const schematicBody = JSON.stringify({
	flow: flowV1FixtureIds.flow,
	expectedVersion: initialDocument.revision,
	requestId: "be6a70a4-a8fb-4387-8580-58f7ea23d574",
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: editorGraphFixture,
	componentManifestHash: flowV1Digest,
});
await expectStatus(await request("/api/trellis-editor/v1/document", { method: "PUT", body: schematicBody }), 403);

const mismatchedNodeIdentity = structuredClone(langflowGraphFixture);
mismatchedNodeIdentity.nodes[0]!.data.id = "another-node";
const mismatchedIdentityBody = JSON.stringify({
	flow: flowV1FixtureIds.flow,
	expectedVersion: initialDocument.revision,
	requestId: "cdcb941f-9c63-4577-be5c-de2d2b042039",
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: mismatchedNodeIdentity,
	componentManifestHash: flowV1Digest,
});
await expectStatus(
	await request("/api/trellis-editor/v1/document", { method: "PUT", body: mismatchedIdentityBody }),
	403,
);

await expectStatus(await request("/__probe/lost-response-next", { method: "POST" }), 200);
const firstRequestId = "b9e9b394-f091-41da-96ca-591b678aac83";
const firstBody = JSON.stringify({
	flow: flowV1FixtureIds.flow,
	expectedVersion: initialDocument.revision,
	requestId: firstRequestId,
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: langflowGraphFixture,
	componentManifestHash: flowV1Digest,
});
let lostResponseObserved = false;
try {
	const lostResponse = await request("/api/trellis-editor/v1/document", { method: "PUT", body: firstBody });
	await lostResponse.text();
} catch {
	lostResponseObserved = true;
}
if (!lostResponseObserved) throw new Error("The probe did not lose the armed save response.");

const newerGraph = structuredClone(langflowGraphFixture);
newerGraph.nodes[0]!.position.x = 144;
const replayReceipt = await readJson(
	await request("/api/trellis-editor/v1/document", { method: "PUT", body: firstBody }),
	200,
);
if (replayReceipt.revision !== initialDocument.revision + 1) {
	throw new Error("The replay receipt does not identify the first accepted revision.");
}
const laterBody = JSON.stringify({
	flow: flowV1FixtureIds.flow,
	expectedVersion: replayReceipt.revision,
	requestId: "04a41342-1dd6-47e6-a23e-3b3ee1955c12",
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: newerGraph,
	componentManifestHash: flowV1Digest,
});
const laterReceipt = await readJson(
	await request("/api/trellis-editor/v1/document", { method: "PUT", body: laterBody }),
	200,
);
if (laterReceipt.revision !== initialDocument.revision + 2) {
	throw new Error("The later save does not advance to the next distinct revision.");
}

await expectStatus(await request("/__probe/advance-revision", { method: "POST" }), 200);
const staleBody = JSON.stringify({
	flow: flowV1FixtureIds.flow,
	expectedVersion: laterReceipt.revision,
	requestId: "4c404b4a-b46f-45d8-bbdc-a27dbb97fd74",
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: newerGraph,
	componentManifestHash: flowV1Digest,
});
await expectStatus(await request("/api/trellis-editor/v1/document", { method: "PUT", body: staleBody }), 409);

await expectStatus(await request("/__probe/expire-grant", { method: "POST" }), 200);
for (const path of [
	"/api/trellis-editor/v1/document",
	"/api/trellis-editor/v1/component-manifest",
	"/api/v1/all",
	`/api/v1/flows/${flowV1FixtureIds.flow}`,
]) {
	await expectStatus(await request(path), 403);
}
await expectStatus(await request("/api/trellis-editor/v1/document", { method: "PUT", body: firstBody }), 403);
const expiredFreshBody = JSON.stringify({
	flow: flowV1FixtureIds.flow,
	expectedVersion: laterReceipt.revision,
	requestId: "0f882b41-0e62-4658-b5b5-2d6b1718b632",
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: newerGraph,
	componentManifestHash: flowV1Digest,
});
await expectStatus(await request("/api/trellis-editor/v1/document", { method: "PUT", body: expiredFreshBody }), 403);

const state = (await readJson(await request("/__probe/state"), 200)) as { events: GatewayEvidenceEvent[] };
const denialReasons = new Set(state.events.map((event) => event.reason));
if (
	!denialReasons.has("manifest_mismatch") ||
	!denialReasons.has("component_authority_mismatch") ||
	!denialReasons.has("invalid_document")
) {
	throw new Error("The gateway evidence does not contain all component authority denials.");
}
const replayEvents = state.events.filter((event) => event.requestId === firstRequestId);
const [acceptedEvent, replayEvent] = replayEvents;
if (
	replayEvents.length !== 2 ||
	acceptedEvent?.requestBytes !== firstBody ||
	replayEvent?.requestBytes !== firstBody ||
	acceptedEvent.replayed !== false ||
	replayEvent.replayed !== true ||
	acceptedEvent.acceptedRevision !== initialDocument.revision + 1 ||
	replayEvent.acceptedRevision !== initialDocument.revision + 1
) {
	throw new Error("The first request evidence does not contain one accepted write and one exact replay.");
}
process.stdout.write(
	`${JSON.stringify({
		lostResponseObserved,
		replayRevision: replayReceipt.revision,
		laterRevision: laterReceipt.revision,
		events: state.events.length,
	})}\n`,
);
