import { afterEach, describe, expect, test } from "bun:test";
import { freshHome } from "../helpers/home.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../helpers/server.ts";
import { readSse } from "../helpers/sse.ts";

// The boot and the shutdown budgets from plan.md: a warm data home answers
// /api/health within 1.5 s of the process start, and a shutdown with an
// open stream and a pending request finishes within 5 s.

const servers: SpawnedServer[] = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
});

const start = (home: string) => {
	const server = spawnServer({ home });
	servers.push(server);
	return server;
};

describe("boot budget", () => {
	test("a warm data home boots to health under 1.5 seconds", async () => {
		const home = freshHome();
		const cold = start(home);
		const first = await cold.listening();
		expect((await fetch(`${first.url}/api/health`)).status).toBe(200);
		await stopServer(cold);

		const warm = start(home);
		const { url } = await warm.listening();
		const response = await fetch(`${url}/api/health`);
		const elapsed = Date.now() - warm.startedAt;

		expect(response.status).toBe(200);
		expect(elapsed).toBeLessThan(1500);
	});

	test("shutdown finishes under 5 seconds", async () => {
		const server = start(freshHome());
		const { url } = await server.listening();
		const stream = readSse(await fetch(`${url}/api/events`));
		expect((await stream.next()).event).toBe("ready");
		const pending = fetch(`${url}/api/tickets?limit=200`);

		const signaledAt = Date.now();
		server.kill("SIGTERM");
		const code = await server.exited();

		expect(code).toBe(0);
		expect(Date.now() - signaledAt).toBeLessThan(5000);
		await pending.then(
			(response) => expect([200, 503]).toContain(response.status),
			() => undefined,
		);
	});
});
