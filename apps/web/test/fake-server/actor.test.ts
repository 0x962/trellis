import { describe, expect, test } from "bun:test";
import { createFakeServer } from "./index";

type ErrorBody = { code: string; status: number; data?: { grammar?: string } };

describe("fake server actor header", () => {
	// WS-121. Every non-GET request needs `x-trellis-actor`; a GET ignores it.
	test("mutations need a valid actor header and reads do not", async () => {
		const server = createFakeServer();
		const body = JSON.stringify({ project: "CDE", title: "No actor" });
		const missing = await server.app.request("/api/tickets", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
		});
		expect(missing.status).toBe(400);
		expect(((await missing.json()) as ErrorBody).code).toBe("ACTOR_REQUIRED");
		const invalid = await server.app.request("/api/tickets", {
			method: "POST",
			headers: { "content-type": "application/json", "x-trellis-actor": "bob" },
			body,
		});
		expect(invalid.status).toBe(400);
		const invalidBody = (await invalid.json()) as ErrorBody;
		expect(invalidBody.code).toBe("ACTOR_INVALID");
		expect(invalidBody.data?.grammar).toBeString();
		const system = await server.app.request("/api/tickets", {
			method: "POST",
			headers: { "content-type": "application/json", "x-trellis-actor": "system:trellis" },
			body,
		});
		expect(((await system.json()) as ErrorBody).code).toBe("ACTOR_INVALID");
		const read = await server.app.request("/api/tickets?project=CDE");
		expect(read.status).toBe(200);
		expect((await server.client.tickets.counts({ project: "CDE" })).total).toBe(52);
	});
});
