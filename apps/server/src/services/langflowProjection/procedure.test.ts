import { expect, test } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { executionViewV1Example } from "@trellis/api";
import type { ServiceTransport } from "../../db/transport.ts";
import type { GhAccess } from "../../ghState.ts";
import type { ProcedureContext } from "../../procedures/base.ts";
import { router } from "../../procedures/index.ts";
import { createDbTiming } from "../../serverTiming.ts";

test("invalid execution IDs return the declared HTTP validation error", async () => {
	let reads = 0;
	const handler = new OpenAPIHandler(router);
	const request = new Request("http://trellis.test/api/flow-executions/not-a-ulid/view-v1");
	const context: ProcedureContext = {
		headers: request.headers,
		reqId: "validation",
		transport: {
			call: async () => {
				reads += 1;
				return executionViewV1Example;
			},
		} as ServiceTransport,
		actor: null,
		timing: createDbTiming(),
		chooseDirectory: async () => null,
		gh: {} as GhAccess,
	};
	const result = await handler.handle(request, { prefix: "/api", context });
	expect(result.matched).toBe(true);
	expect(result.response!.status).toBe(400);
	const body = await result.response!.json();
	expect(body.code).toBe("INPUT_VALIDATION_FAILED");
	expect(body.data.issues.length).toBeGreaterThan(0);
	expect(reads).toBe(0);
});
