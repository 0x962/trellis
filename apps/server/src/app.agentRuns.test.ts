import { expect, test } from "bun:test";
import { ulid } from "ulid";
import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import type { Runtime, ServiceTransport } from "./db/transport.ts";
import type { Bus } from "./events/bus.ts";
import type { Logger } from "./log.ts";

test("the agent list HTTP route passes an explicit all-history flag", async () => {
	const calls: Array<{ name: string; input: unknown }> = [];
	const transport = {
		call: async (name: string, _ctx: unknown, input: unknown) => {
			calls.push({ name, input });
			return { items: [], nextCursor: null };
		},
	} as unknown as ServiceTransport;
	const app = createApp({
		config: {
			home: "/tmp/trellis-agent-list-route-test",
			authToken: null,
			host: "127.0.0.1",
			allowedHosts: [],
			port: 4521,
			webDist: "/tmp/trellis-agent-list-route-test/web",
		} as unknown as Config,
		log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger,
		transport,
		bus: {} as Bus,
		runtime: { version: "test", bootId: ulid() } as Runtime,
	}).app;

	const response = await app.request("http://127.0.0.1:4521/api/agent-runs?allHistory=true");

	expect(response.status).toBe(200);
	expect(calls).toEqual([
		{
			name: "agentRuns.list",
			input: expect.objectContaining({ allHistory: true }),
		},
	]);
});
