import { expect, test } from "bun:test";
import { HarnessSchema } from "@trellis/api";
import { createApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import type { Runtime, ServiceTransport } from "../db/transport.ts";
import { fail } from "../errors.ts";
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

test("whiteboard routes preserve slash refs and expose revision conflicts as 412", async () => {
	const calls: Array<{ name: string; input: unknown }> = [];
	const snapshot = { store: { "shape:draw": { points: [1, 2, 3] } } };
	const app = createApp({
		config: loadConfig({ TRELLIS_HOME: "/fixture/trellis-whiteboard", TRELLIS_PORT: "4521" }),
		log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger,
		transport: {
			call: async (name: string, _ctx: unknown, input: unknown) => {
				calls.push({ name, input });
				if (name === "epics.whiteboard") return { snapshot: null, revision: 0 };
				if (calls.length > 2) throw fail("EPIC_WHITEBOARD_VERSION_CONFLICT", { revision: 1 });
				return { revision: 1 };
			},
		} as ServiceTransport,
		bus: {} as Bus,
		runtime: { version: "test", bootId: "test" } as Runtime,
	}).app;
	const url = "http://127.0.0.1:4521/api/epics/whiteboard/TRL/plan";
	const read = await app.request(url);
	expect(read.status).toBe(200);
	expect(await read.json()).toEqual({ snapshot: null, revision: 0 });
	const request = {
		method: "PUT",
		headers: { "Content-Type": "application/json", "x-trellis-actor": "human:Planner" },
		body: JSON.stringify({ snapshot, expectedRevision: 0 }),
	};
	const saved = await app.request(url, request);
	expect(saved.status).toBe(200);
	expect(await saved.json()).toEqual({ revision: 1 });
	const conflict = await app.request(url, request);
	expect(conflict.status).toBe(412);
	expect(await conflict.json()).toMatchObject({ code: "EPIC_WHITEBOARD_VERSION_CONFLICT", data: { revision: 1 } });
	expect(calls).toEqual([
		{ name: "epics.whiteboard", input: { epic: "TRL/plan" } },
		{ name: "epics.saveWhiteboard", input: { epic: "TRL/plan", snapshot, expectedRevision: 0 } },
		{ name: "epics.saveWhiteboard", input: { epic: "TRL/plan", snapshot, expectedRevision: 0 } },
	]);
});
