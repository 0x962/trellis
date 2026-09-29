import { expect, test } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { pendingDocumentV1Example } from "@trellis/api";
import type { ServiceTransport } from "../../db/transport.ts";
import type { GhAccess } from "../../ghState.ts";
import type { ProcedureContext } from "../../procedures/base.ts";
import { createFlowDocumentsV1 } from "../../procedures/flowDocumentsV1.ts";
import { createDbTiming } from "../../serverTiming.ts";
import { saveInput } from "./fixture";

const request = async (body: unknown, actor: string | null) => {
	let calls = 0;
	const router = createFlowDocumentsV1({
		get: async () => {
			throw new Error("unexpected get");
		},
		save: async () => {
			calls++;
			return pendingDocumentV1Example;
		},
		view: async () => {
			throw new Error("unexpected view");
		},
	});
	const handler = new OpenAPIHandler<ProcedureContext>(router);
	const headers = new Headers({ "content-type": "application/json" });
	if (actor !== null) headers.set("x-trellis-actor", actor);
	const raw = new Request("http://trellis.test/api/flows/review/document-v1", {
		method: "PUT",
		headers,
		body: JSON.stringify(body),
	});
	const result = await handler.handle(raw, {
		prefix: "/api",
		context: {
			headers,
			reqId: "test",
			actor: null,
			timing: createDbTiming(),
			transport: {} as ServiceTransport,
			gh: {} as GhAccess,
			chooseDirectory: async () => null,
		},
	});
	return { response: result.response!, calls };
};

test("document HTTP validation returns declared fields and does not call save", async () => {
	for (const invalid of [{ requestId: "bad" }, { expectedVersion: 0 }]) {
		const result = await request({ ...saveInput(), ...invalid }, "human:test");
		expect(result.response.status).toBe(400);
		const body = await result.response.json();
		expect(body.code).toBe("INPUT_VALIDATION_FAILED");
		expect(body.data.issues.length).toBeGreaterThan(0);
		expect(result.calls).toBe(0);
	}
});

test("a document write requires a valid actor before the handler runs", async () => {
	for (const actor of [null, "invalid"]) {
		const result = await request(saveInput(), actor);
		expect(result.calls).toBe(0);
		expect((await result.response.json()).code).toBe(actor === null ? "ACTOR_REQUIRED" : "ACTOR_INVALID");
	}
});
