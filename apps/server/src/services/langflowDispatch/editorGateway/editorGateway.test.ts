import { afterAll, beforeAll, expect, test } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { EditorBootstrapSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { loadConfig } from "../../../config";
import type { ServiceTransport } from "../../../db/transport";
import { router } from "../../../procedures";
import type { ProcedureContext } from "../../../procedures/base";
import { saveWithEditor } from "../../../procedures/flowDocumentRoutes/saveWithEditor";
import { createDbTiming } from "../../../serverTiming";
import { editorFixture } from "../../langflowEditorSessions/fixture";
import { services } from "../../registry";
import { editorGateway } from "./editorGateway";

let h: Awaited<ReturnType<typeof editorFixture>>;
beforeAll(async () => {
	h = await editorFixture();
	await h.db.execute(
		sql`INSERT INTO settings(key,value,updated_at) VALUES ('defaultActorName',${JSON.stringify("test")}::jsonb,${h.ctx.now})`,
	);
});
afterAll(async () => h.db.$client.close());

test("the gateway uses committed services and recovers a lost save response", async () => {
	const f = await h.setup();
	const calls: string[] = [];
	let loseResponse = false;
	const transport: ServiceTransport = {
		start: async () => {
			throw new Error("Unexpected transport start");
		},
		close: async () => {},
		call: async (name, context, input) => {
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
	const gateway = editorGateway(loadConfig({ TRELLIS_AUTH_TOKEN: f.options.hostToken }), transport, {
		identity: { version: 1, home: "/fixture", hostId: "host", dataHomeId: "home" },
		parentOrigin: f.options.parentOrigin,
		editorOrigin: f.options.editorOrigin,
		installedManifest: f.options.installedManifest,
	});
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
	);
	expect(session.identity.actor).toBe("human:test");
	expect(responseHeaders.get("set-cookie")).toContain("HttpOnly");
	const bootstrap = await gateway.fetch(
		new Request(`${f.options.parentOrigin}/api/trellis-editor/v1/sessions/${session.channel}/session`, {
			headers: { cookie: responseHeaders.get("set-cookie")!.split(";")[0]!, origin: f.options.editorOrigin },
		}),
	);
	expect(EditorBootstrapSchema.parse(await bootstrap.json()).project).toBe(f.current.document.flow.project);
	const wrongOrigin = new Headers(headers);
	wrongOrigin.set("origin", "http://foreign.invalid");
	await expect(
		gateway.issue({ flow: session.identity.flowId, expectedVersion: session.identity.revision }, wrongOrigin),
	).rejects.toMatchObject({ code: "EDITOR_ACCESS_REFUSED" });
	headers.set("x-trellis-editor-channel", session.channel);
	const context = {
		headers,
		transport,
		actor: { kind: "human", name: "test" },
		reqId: "editor-composition",
		editorGateway: gateway,
		timing: createDbTiming(),
	} as ProcedureContext;
	const input = f.input(session.identity.revision);
	loseResponse = true;
	await expect(saveWithEditor(context, input)).rejects.toThrow("Committed response lost");
	const receipt = await saveWithEditor(context, input);
	expect(receipt.revision).toBe(input.expectedVersion + 1);
	expect(calls.filter((name) => name === "flowDocuments.save")).toHaveLength(1);
	expect(calls).toContain("langflowEditor.readSaveReceipt");
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
