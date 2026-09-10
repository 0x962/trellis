import { afterEach, describe, expect, test } from "bun:test";
import { freshHome } from "../helpers/home.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../helpers/server.ts";
import { readSse } from "../helpers/sse.ts";
import { budget, report } from "./measure.ts";
import { perfHome } from "./perfHome.ts";
import { PERF_ROWS } from "./seed.ts";

// The boot and the shutdown budgets from plan.md: a warm data home answers
// /api/health within 1.5 s of the process start, a first run on an empty
// home within 3.5 s, and a shutdown with an open stream and a pending request
// finishes within 5 s.

const servers: SpawnedServer[] = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
});

const start = (home: string, env?: Record<string, string>) => {
	const server = spawnServer({ home, env });
	servers.push(server);
	return server;
};

// The time from the process start to the first 200 from /api/health.
const bootToHealth = async (server: SpawnedServer) => {
	const { url } = await server.listening();
	const response = await fetch(`${url}/api/health`);
	expect(response.status).toBe(200);
	return Date.now() - server.startedAt;
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

	test(
		"a first run on an empty home boots to health under 3.5 seconds",
		async () => {
			const elapsed = await bootToHealth(start(freshHome()));
			expect(report("first run boot", elapsed, budget(3500))).toBeLessThanOrEqual(budget(3500));
		},
		{ timeout: 30_000 },
	);

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

// The seeded home holds 40 open pull requests. gh points at a path with no
// file, so the poller never asks GitHub about them.
describe.skipIf(PERF_ROWS === 0)(`boot budget at ${PERF_ROWS} rows`, () => {
	test(
		"a warm seeded home boots to health under 1.5 seconds",
		async () => {
			const home = await perfHome();
			const env = { TRELLIS_GH_BIN: "/nonexistent/gh" };
			await bootToHealth(start(home, env));
			await stopServer(servers.pop()!);

			const elapsed = await bootToHealth(start(home, env));
			expect(report("warm boot", elapsed, budget(1500))).toBeLessThanOrEqual(budget(1500));
		},
		{ timeout: 600_000 },
	);
});
