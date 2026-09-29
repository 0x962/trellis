import { expect } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import type { ServiceCtx } from "../../context.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import type { GhAccess } from "../../ghState.ts";
import { type ProcedureContext, router } from "../../procedures/index.ts";
import { createDbTiming } from "../../serverTiming.ts";
import { services } from "../registry.ts";
import type { migratedFixture } from "./migratedFixture.ts";

export function httpFixture(db: Awaited<ReturnType<typeof migratedFixture>>["db"], context: ServiceCtx) {
	const handler = new OpenAPIHandler<ProcedureContext>(router, { plugins: [new ResponseHeadersPlugin()] });
	const call: ServiceTransport["call"] = async (name, ctx, input) => {
		const entry = services[name];
		if (entry.family !== "core" || entry.kind !== "read") throw new Error(`Unexpected history service: ${name}`);
		return db.transaction((tx) => entry.run({ ...context, ...ctx }, tx, input));
	};
	return async (path: string) => {
		const raw = new Request(`http://localhost/api${path}`);
		const result = await handler.handle(raw, {
			prefix: "/api",
			context: {
				headers: raw.headers,
				reqId: "history-http",
				transport: { call } as ServiceTransport,
				actor: null,
				timing: createDbTiming(),
				chooseDirectory: async () => null,
				gh: {} as GhAccess,
			},
		});
		expect(result.matched).toBe(true);
		return result.response!;
	};
}
