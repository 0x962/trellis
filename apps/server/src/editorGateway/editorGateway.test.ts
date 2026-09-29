import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { EditorBootstrapSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { loadConfig } from "../config";
import type { ServiceTransport } from "../db/transport";
import { LangflowHostControl } from "../langflowHost";
import { router } from "../procedures";
import type { ProcedureContext } from "../procedures/base";
import { saveWithEditor } from "../procedures/flowDocumentRoutes/components/saveWithEditor";
import { createDbTiming } from "../serverTiming";
import { saveDocument } from "../services/langflowDispatch";
import { editorFixture } from "../services/langflowEditorSessions/fixture";
import { services } from "../services/registry";
import { editorGateway } from "./editorGateway";

const root = mkdtempSync(join(process.env.TMPDIR!, "trellis-editor-gateway-"));
const home = join(root, "home");
mkdirSync(home);
const control = LangflowHostControl.create({
	home,
	evidence: {
		readTerminal: async () => {
			throw new Error("Unexpected terminal read");
		},
		withReconciliation: async () => {
			throw new Error("Unexpected reconciliation");
		},
	},
});
let h: Awaited<ReturnType<typeof editorFixture>>;
beforeAll(async () => {
	h = await editorFixture();
	await h.db.execute(
		sql`INSERT INTO settings(key,value,updated_at) VALUES ('defaultActorName',${JSON.stringify("test")}::jsonb,${h.ctx.now})`,
	);
});
afterAll(async () => {
	await h.db.$client.close();
	rmSync(root, { recursive: true });
});

test("the gateway uses committed services and recovers a lost save response", async () => {
	const f = await h.setup();
	const calls: string[] = [];
	const scope = { reqId: "editor-composition", timing: createDbTiming() };
	let loseResponse = false;
	const transport: ServiceTransport = {
		start: async () => {
			throw new Error("Unexpected transport start");
		},
		close: async () => {},
		call: async (name, context, input, timing) => {
			expect(context.reqId).toBe(scope.reqId);
			expect(timing).toBe(scope.timing);
			calls.push(name);
			const entry = services[name];
			if (entry.family !== "core") throw new Error("Expected a core service");
			const value = await h.run((tx) => entry.run({ ...h.ctx, ...context }, tx, input));
			if (name === "flowDocuments.save" && loseResponse) {
				loseResponse = false;
				throw new Error("Committed response lost");
			}
			return value;
		},
	};
	const gateway = editorGateway(
		loadConfig({ TRELLIS_HOME: home, TRELLIS_AUTH_TOKEN: f.options.hostToken }),
		transport,
		{
			identity: control.identity,
			parentOrigin: f.options.parentOrigin,
			editorOrigin: f.options.editorOrigin,
			installedManifest: f.options.installedManifest,
		},
	);
	const headers = new Headers({
		authorization: `Bearer ${f.options.hostToken}`,
		origin: f.options.parentOrigin,
		"x-trellis-actor": "human:forged-label",
	});
	const responseHeaders = new Headers();
	const session = await gateway.issue(
		{ flow: f.current.document.flow.id, expectedVersion: f.current.document.revision },
		headers,
		responseHeaders,
		scope,
	);
	expect(session.identity.actor).toBe("human:test");
	expect(responseHeaders.get("set-cookie")).toContain("HttpOnly");
	const bootstrap = await gateway.fetch(
		new Request(`${f.options.parentOrigin}/api/trellis-editor/v1/sessions/${session.channel}/session`, {
			headers: { cookie: responseHeaders.get("set-cookie")!.split(";")[0]!, origin: f.options.editorOrigin },
		}),
		scope,
	);
	expect(EditorBootstrapSchema.parse(await bootstrap.json()).project).toBe(f.current.document.flow.project);
	const wrongOrigin = new Headers(headers);
	wrongOrigin.set("origin", "http://foreign.invalid");
	await expect(
		gateway.issue(
			{ flow: session.identity.flowId, expectedVersion: session.identity.revision },
			wrongOrigin,
			undefined,
			scope,
		),
	).rejects.toMatchObject({ code: "EDITOR_ACCESS_REFUSED" });
	headers.set("x-trellis-editor-channel", session.channel);
	const context = {
		headers,
		transport,
		actor: { kind: "human", name: "test" },
		reqId: "editor-composition",
		editorGateway: gateway,
		timing: scope.timing,
	} as ProcedureContext;
	const input = f.input(session.identity.revision);
	loseResponse = true;
	await expect(saveWithEditor(context, input)).rejects.toThrow("Committed response lost");
	const receipt = await saveWithEditor(context, input);
	expect(receipt.revision).toBe(input.expectedVersion + 1);
	expect(calls.filter((name) => name === "flowDocuments.save")).toHaveLength(1);
	expect(calls).toContain("langflowEditor.readSaveReceipt");
	const identityPath = join(LangflowHostControl.directory(home), "identity.json");
	const original = readFileSync(identityPath, "utf8");
	const replacement = { ...control.identity, hostId: crypto.randomUUID(), dataHomeId: crypto.randomUUID() };
	try {
		writeFileSync(identityPath, JSON.stringify(replacement));
		expect(gateway.host()).toBe(`${replacement.hostId}:${replacement.dataHomeId}`);
		await expect(
			gateway.issue({ flow: session.identity.flowId, expectedVersion: receipt.revision }, headers, undefined, scope),
		).rejects.toMatchObject({ code: "EDITOR_ACCESS_REFUSED", status: 403 });
	} finally {
		writeFileSync(identityPath, original);
	}
});

test("the mounted session route refuses issuance without host configuration", async () => {
	const raw = new Request("http://localhost/api/flows/review/editor-session-v1", {
		method: "POST",
		headers: { "content-type": "application/json", "x-trellis-actor": "human:test" },
		body: JSON.stringify({ expectedVersion: 1 }),
	});
	let calls = 0;
	const transport: ServiceTransport = {
		start: async () => {
			throw new Error("Unexpected transport start");
		},
		close: async () => {},
		call: async () => {
			calls += 1;
			throw new Error("Unexpected service call");
		},
	};
	const result = await new OpenAPIHandler<ProcedureContext>(router).handle(raw, {
		prefix: "/api",
		context: {
			headers: raw.headers,
			transport,
			actor: null,
			reqId: "unconfigured-editor",
			timing: createDbTiming(),
		} as ProcedureContext,
	});
	expect(result.matched).toBe(true);
	expect(result.response!.status).toBe(503);
	expect((await result.response!.json()).code).toBe("EDITOR_UNAVAILABLE");
	expect(calls).toBe(0);
});

test("mounted editor requests retain conflict and unavailable statuses", async () => {
	const f = await h.setup();
	const scope = { reqId: "editor-status", timing: createDbTiming() };
	const transport: ServiceTransport = {
		start: async () => {
			throw new Error("Unexpected transport start");
		},
		close: async () => {},
		call: async (name, context, input) => {
			const entry = services[name];
			if (entry.family !== "core") throw new Error("Expected a core service");
			return h.run((tx) => entry.run({ ...h.ctx, ...context }, tx, input));
		},
	};
	const gateway = editorGateway(
		loadConfig({ TRELLIS_HOME: home, TRELLIS_AUTH_TOKEN: f.options.hostToken }),
		transport,
		{
			identity: control.identity,
			parentOrigin: f.options.parentOrigin,
			editorOrigin: f.options.editorOrigin,
			installedManifest: f.options.installedManifest,
		},
	);
	const headers = new Headers({
		authorization: `Bearer ${f.options.hostToken}`,
		origin: f.options.parentOrigin,
		"content-type": "application/json",
		"x-trellis-actor": "human:test",
	});
	const request = async (path: string, body: unknown, method = "POST") => {
		const raw = new Request(`${f.options.parentOrigin}/api${path}`, { method, headers, body: JSON.stringify(body) });
		const result = await new OpenAPIHandler<ProcedureContext>(router).handle(raw, {
			prefix: "/api",
			context: { headers: raw.headers, transport, actor: null, editorGateway: gateway, ...scope } as ProcedureContext,
		});
		return result.response!;
	};
	const path = `/flows/${f.current.document.flow.id}/editor-session-v1`;
	const stale = await request(path, { expectedVersion: f.current.document.revision - 1 });
	expect(stale.status).toBe(412);
	expect(await stale.json()).toMatchObject({
		code: "FLOW_VERSION_CONFLICT",
		data: { version: f.current.document.revision },
	});
	await h.db.execute(sql`DELETE FROM settings WHERE key='defaultActorName'`);
	try {
		const missingActor = await request(path, { expectedVersion: f.current.document.revision });
		expect(missingActor.status).toBe(503);
		expect((await missingActor.json()).code).toBe("EDITOR_ACTOR_UNCONFIGURED");
	} finally {
		await h.db.execute(
			sql`INSERT INTO settings(key,value,updated_at) VALUES ('defaultActorName',${JSON.stringify("test")}::jsonb,${h.ctx.now})`,
		);
	}
	const session = await gateway.issue(
		{ flow: f.current.document.flow.id, expectedVersion: f.current.document.revision },
		headers,
		new Headers(),
		scope,
	);
	headers.set("x-trellis-editor-channel", session.channel);
	const input = f.input(session.identity.revision);
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const first = gateway.withDocumentSave(
		{ channel: session.channel, actor: { kind: "human", name: "test" }, input },
		async () => {
			entered.resolve();
			await release.promise;
			return h.run((tx) => saveDocument(h.ctx, tx, { document: input, ifMatch: null, ifNoneMatch: null }));
		},
		headers,
		scope,
	);
	await entered.promise;
	try {
		const busy = await request(`/flows/${input.flow}/document-v1`, { ...input, requestId: crypto.randomUUID() }, "PUT");
		expect(busy.status).toBe(409);
		expect((await busy.json()).code).toBe("EDITOR_SAVE_IN_PROGRESS");
	} finally {
		release.resolve();
		await first;
	}
});
