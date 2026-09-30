import { expect, test } from "bun:test";
import { HarnessSchema } from "@trellis/api";
import { createApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import type { Runtime, ServiceTransport } from "../db/transport.ts";
import type { Bus } from "../events/bus.ts";
import type { Logger } from "../log.ts";

test("autopilot routes preserve slash refs and reach the settings services", async () => {
	const autopilot = {
		enabled: true,
		maxConcurrency: 2,
		accountId: null,
		harness: HarnessSchema.parse({ preset: "codex" }),
	};
	const calls: Array<{ name: string; input: unknown }> = [];
	const app = createApp({
		config: loadConfig({ TRELLIS_HOME: "/fixture/trellis-autopilot", TRELLIS_PORT: "4521" }),
		log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger,
		transport: {
			call: async (name: string, _ctx: unknown, input: unknown) => {
				calls.push({ name, input });
				return autopilot;
			},
		} as ServiceTransport,
		bus: {} as Bus,
		runtime: { version: "test", bootId: "test" } as Runtime,
	}).app;
	const url = "http://127.0.0.1:4521/api/epics/autopilot/AUTO/flight";
	const read = await app.request(url);
	expect(read.status).toBe(200);
	expect(await read.json()).toEqual(autopilot);
	const write = await app.request(url, {
		method: "PUT",
		headers: { "Content-Type": "application/json", "x-trellis-actor": "human:Planner" },
		body: JSON.stringify({ autopilot }),
	});
	expect(write.status).toBe(200);
	expect(calls).toEqual([
		{ name: "epics.autopilot", input: { epic: "AUTO/flight" } },
		{ name: "epics.setAutopilot", input: { epic: "AUTO/flight", autopilot } },
	]);
});
