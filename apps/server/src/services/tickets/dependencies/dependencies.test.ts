import { expect, test } from "bun:test";
import { ulid } from "ulid";
import { createApp } from "../../../app.ts";
import type { Config } from "../../../config.ts";
import type { Runtime, ServiceTransport } from "../../../db/transport.ts";
import type { Bus } from "../../../events/bus.ts";
import type { Logger } from "../../../log.ts";

test("the exact dependency route returns completed relationships and keeps mutation authorization", async () => {
	const calls: Array<{ name: string; input: unknown }> = [];
	const result = { waitsOn: [{ identifier: "EXT-2", title: "Completed prerequisite", status: "done" }], blocks: [] };
	const app = createApp({
		config: {
			home: "/tmp/trellis-dependency-route",
			authToken: null,
			host: "127.0.0.1",
			allowedHosts: [],
			port: 4521,
			webDist: "/tmp/trellis-dependency-route/web",
		} as unknown as Config,
		log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger,
		transport: {
			call: async (name: string, _ctx: unknown, input: unknown) => {
				calls.push({ name, input });
				return result;
			},
		} as unknown as ServiceTransport,
		bus: {} as Bus,
		runtime: { version: "test", bootId: ulid() } as Runtime,
	}).app;
	const response = await app.request("http://127.0.0.1:4521/api/tickets/TST-1/dependencies");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(result);
	expect(calls).toEqual([{ name: "tickets.dependencies", input: { ticket: "TST-1" } }]);
	const denied = await app.request("http://127.0.0.1:4521/api/tickets/TST-1/dependencies", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ notAfter: ["EXT-2"] }),
	});
	expect(denied.status).toBe(400);
	expect(await denied.json()).toMatchObject({ code: "ACTOR_REQUIRED" });
	expect(calls).toHaveLength(1);
});
