import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let app: TestApp;
let failure: (requestId: string) => Error;
beforeAll(async () => {
	app = await createTestApp({
		wrapTransport: (inner) => ({
			...inner,
			call: (name, context, input, timing) => {
				if (name === "system.resumeRestart") return Promise.reject(failure(context.reqId));
				return inner.call(name, context, input, timing);
			},
		}),
	});
});
beforeEach(() => {
	app.records.length = 0;
});
afterEach(() => app.serverTx(assertStatusInvariant));
afterAll(() => app.close());

const request = (wire: "api" | "rpc") =>
	app.api(wire === "api" ? "/api/native-work/restart/resume" : "/rpc/system/resumeRestart", {
		method: "POST",
		body: wire === "api" ? { restartId: "restart" } : { json: { restartId: "restart" } },
	});

for (const wire of ["api", "rpc"] as const) {
	test(`${wire} preserves a declared restart failure and logs its request ID`, async () => {
		failure = (requestId) =>
			new ORPCError("RESTART_FAILED", {
				defined: true,
				status: 503,
				message: "Could not restore Manager in RST: Workspace temporarily unavailable",
				data: { restartId: "restart", runId: "run", attemptId: "attempt", requestId },
			});
		const response = await request(wire);
		const body = wire === "api" ? response.body : response.body.json;
		const requestId = response.headers.get("x-request-id");
		expect(response.status).toBe(503);
		expect(body).toMatchObject({
			defined: true,
			code: "RESTART_FAILED",
			message: "Could not restore Manager in RST: Workspace temporarily unavailable",
			data: { restartId: "restart", runId: "run", attemptId: "attempt", requestId },
		});
		expect(app.records).toContainEqual(
			expect.objectContaining({
				level: "error",
				msg: "procedure failed",
				reqId: requestId,
				path: wire === "api" ? "/api/native-work/restart/resume" : "/rpc/system/resumeRestart",
				message: body.message,
			}),
		);
	});

	test(`${wire} logs an unexpected restart error without exposing it in the response`, async () => {
		failure = () => new Error("private database failure detail");
		const response = await request(wire);
		const body = wire === "api" ? response.body : response.body.json;
		expect(response.status).toBe(500);
		expect(body).toMatchObject({ defined: false, code: "INTERNAL_SERVER_ERROR" });
		expect(JSON.stringify(body)).not.toContain("private database failure detail");
		expect(app.records).toContainEqual(
			expect.objectContaining({
				level: "error",
				msg: "procedure failed",
				reqId: response.headers.get("x-request-id"),
				message: "private database failure detail",
			}),
		);
	});
}
