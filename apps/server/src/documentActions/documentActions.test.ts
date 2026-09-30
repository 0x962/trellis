import { expect, test } from "bun:test";
import type { FlowDocumentActionResultV1, PublishDocumentV1Input } from "@trellis/api";
import { flowV1RequestId, pendingDocumentV1Example } from "../../../../packages/api/src/schemas/flowV1Fixtures";
import { createApp } from "../app";
import { loadConfig } from "../config";
import type { ServiceTransport } from "../db/transport";
import { createBus } from "../events/bus";
import { createGhRunner } from "../gh/run";
import { bootstrapFixture } from "../langflowBootstrap/fixtures";
import { createLogger } from "../log";
import type { DocumentActionInput } from "../services/langflowDispatch/documentAction";
import { documentActions, type DocumentActionRuntime } from "./documentActions";

const input: PublishDocumentV1Input = {
	flowId: pendingDocumentV1Example.flow.id,
	expectedVersion: pendingDocumentV1Example.revision,
	expectedDocumentHash: pendingDocumentV1Example.documentHash,
	componentManifestHash: "a".repeat(64),
	enginePackageDigest: "a".repeat(64),
	requestId: flowV1RequestId,
};
const headers = {
	authorization: "Bearer host",
	"x-trellis-actor": "human:reviewer",
	"content-type": "application/json",
};

function fixture(call: ServiceTransport["call"], runtime?: DocumentActionRuntime) {
	return createApp({
		config: loadConfig({ TRELLIS_AUTH_TOKEN: "host" }),
		transport: { call, start: async () => ({ applied: 0, liveShas: [] }), close: async () => {} },
		bus: createBus({ bootId: "document-actions" }),
		log: createLogger({ level: "error", env: {}, sink: { isTTY: false, write: () => {} } }),
		runtime: {
			version: "test",
			bootId: "document-actions",
			gh: createGhRunner(),
			ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: new Date().toISOString() }),
			addresses: async () => [],
		},
		documentActionRuntime: runtime,
	});
}

test("mounted document actions replay without any configured engine", async () => {
	const calls: string[] = [];
	const f = fixture(async (name, context) => {
		calls.push(name);
		expect(context.actor).toEqual({ kind: "human", name: "reviewer" });
		return { state: "completed", requestId: input.requestId, document: pendingDocumentV1Example };
	});
	for (const [path, value] of [
		["publication-v1", input],
		["conversion-v1", input],
		[
			"conversion-edits-v1",
			{ ...input, schemaVersion: 1, edits: [{ kind: "set-flow-briefing", briefing: "exact  text" }] },
		],
	] as const) {
		const response = await f.app.request(`http://localhost/api/flows/${input.flowId}/${path}`, {
			method: "POST",
			headers,
			body: JSON.stringify(value),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ requestId: input.requestId, document: pendingDocumentV1Example });
	}
	expect(calls).toEqual(Array(3).fill("flowDocuments.actionReceipt"));
	await f.stopDocumentActions();
});

test("mounted actions retain authentication and refuse new work without configuration", async () => {
	let calls = 0;
	const f = fixture(async () => {
		calls++;
		return { state: "miss", requestId: input.requestId };
	});
	const path = `http://localhost/api/flows/${input.flowId}/publication-v1`;
	const unauthorized = await f.app.request(path, { method: "POST", body: JSON.stringify(input) });
	expect(unauthorized.status).toBe(401);
	expect(calls).toBe(0);
	const unavailable = await f.app.request(path, { method: "POST", headers, body: JSON.stringify(input) });
	expect(unavailable.status).toBe(503);
	expect(calls).toBe(1);
	await f.stopDocumentActions();
});

test("completed replay skips a configured but unhealthy supervisor", async () => {
	const base = bootstrapFixture();
	const f = fixture(
		async () => ({ state: "completed", requestId: input.requestId, document: pendingDocumentV1Example }),
		{
			get package() {
				throw new Error("Package access before replay");
			},
			get nativePolicy() {
				throw new Error("Policy access before replay");
			},
			engineCommit: base.manifest.source.commit,
			supervisor: {
				withHealthyEngine: async () => {
					throw new Error("Engine access before replay");
				},
			},
		},
	);
	for (const [path, value] of [
		["publication-v1", input],
		["conversion-v1", input],
		[
			"conversion-edits-v1",
			{ ...input, schemaVersion: 1, edits: [{ kind: "set-flow-briefing", briefing: "exact  text" }] },
		],
	] as const) {
		const response = await f.app.request(`http://localhost/api/flows/${input.flowId}/${path}`, {
			method: "POST",
			headers,
			body: JSON.stringify(value),
		});
		expect(response.status).toBe(200);
	}
	await f.stopDocumentActions();
});

test("pending publication holds the current supervisor through the worker and shutdown waits", async () => {
	const base = bootstrapFixture();
	let held = false;
	const started = Promise.withResolvers<void>();
	const result = Promise.withResolvers<FlowDocumentActionResultV1>();
	const transport: ServiceTransport = {
		start: async () => ({ applied: 0, liveShas: [] }),
		close: async () => {},
		call: async (name, _context, value) => {
			if (name === "flowDocuments.actionReceipt") {
				expect(held).toBe(false);
				return { state: "pending", requestId: input.requestId };
			}
			expect(name).toBe("flowDocuments.action");
			expect(held).toBe(true);
			const action = value as DocumentActionInput;
			expect(action.value).toEqual(input);
			expect(action.nativePolicyConfiguration).toBeNull();
			expect(action.authenticationFile).toBe("/isolated/trellis/langflow/secrets/current-instance.token");
			started.resolve();
			return result.promise;
		},
	};
	const actions = documentActions({
		home: base.identity.home,
		transport,
		runtime: {
			package: base.candidate,
			engineCommit: base.manifest.source.commit,
			supervisor: {
				withHealthyEngine: async (operation) => {
					held = true;
					try {
						return await operation({
							id: "observation",
							observedAt: "2026-09-29T00:00:00.000Z",
							endpoint: "http://127.0.0.1:7860",
							identity: {
								...base.identity,
								ownerId: "owner",
								instanceId: "current-instance",
								manifestDigest: base.candidate.enginePackageDigest,
							},
						});
					} finally {
						held = false;
					}
				},
			},
		},
	});
	const work = actions.run(
		{ operation: "publish", value: input },
		{ actor: { kind: "human", name: "reviewer" }, session: null, reqId: "request", now: new Date() },
	);
	await started.promise;
	let stopped = false;
	const closing = actions.stop().then(() => {
		stopped = true;
	});
	await Promise.resolve();
	expect(stopped).toBe(false);
	result.resolve({ state: "pending", requestId: input.requestId });
	expect(await work).toEqual({ state: "pending", requestId: input.requestId });
	await closing;
	expect(held).toBe(false);
});
