import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createTrellisClient } from "@trellis/api";
import { freshHome } from "../helpers/home.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../helpers/server.ts";
import { report } from "./measure.ts";
import { type PerfServer, startPerfServer } from "./perfServer.ts";
import { READ_MIX } from "./queries.ts";
import { PERF_ROWS } from "./seed.ts";

// The memory budgets from plan.md: the server holds 350 MB or less of
// resident memory while it waits for requests, and 550 MB or less at its
// peak. A first boot on an empty home creates the database cluster, so the
// first test covers the costliest boot.

const MB = 1024 * 1024;
const IDLE_RSS_BUDGET = 350 * MB;
const IDLE_RSS_BUDGET_MB = 350;
const PEAK_RSS_BUDGET_MB = 550;

// The resident size is flat from about 2 seconds after listening.
const SETTLE_MS = 3000;

// The reads of one person's busy hour. rss grew over the first 300 of these
// and then stayed high, so the load runs well past that point.
const QUERIES = 1400;
const SAMPLE_EVERY = 50;

const servers: SpawnedServer[] = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
});

describe("memory budget", () => {
	test(
		"a first boot on an empty home idles at 350 MB rss or less",
		async () => {
			const server = spawnServer({ home: freshHome() });
			servers.push(server);
			const { url } = await server.listening();
			await Bun.sleep(SETTLE_MS);

			const health = (await (await fetch(`${url}/api/health`)).json()) as { rss: number };

			expect(health.rss).toBeLessThanOrEqual(IDLE_RSS_BUDGET);
		},
		{ timeout: 30_000 },
	);
});

// The tests of this block run in order on one server: idle after boot, the
// peak under load, then idle again after the load.
describe.skipIf(PERF_ROWS === 0)(`memory budget at ${PERF_ROWS} rows`, () => {
	let server: PerfServer;
	beforeAll(async () => {
		server = await startPerfServer();
	}, 600_000);
	afterAll(() => server.stop());

	test(
		"the server on the seeded home idles at 350 MB rss or less",
		async () => {
			await Bun.sleep(SETTLE_MS);
			const rss = await server.rssMb();
			expect(report("idle rss", rss, IDLE_RSS_BUDGET_MB, "MB")).toBeLessThanOrEqual(IDLE_RSS_BUDGET_MB);
		},
		{ timeout: 30_000 },
	);

	test(
		`rss peaks at 550 MB or less through ${QUERIES} list and search queries`,
		async () => {
			const client = createTrellisClient(server.url, "agent:perf");
			let peak = 0;
			for (let i = 1; i <= QUERIES; i++) {
				await READ_MIX[i % READ_MIX.length]!(client);
				if (i % SAMPLE_EVERY === 0) peak = Math.max(peak, await server.rssMb());
			}
			expect(report("peak rss", peak, PEAK_RSS_BUDGET_MB, "MB")).toBeLessThanOrEqual(PEAK_RSS_BUDGET_MB);
		},
		{ timeout: 600_000 },
	);

	test(
		"after the queries the server idles at 350 MB rss or less again",
		async () => {
			await Bun.sleep(SETTLE_MS);
			const rss = await server.rssMb();
			expect(report("idle rss after use", rss, IDLE_RSS_BUDGET_MB, "MB")).toBeLessThanOrEqual(IDLE_RSS_BUDGET_MB);
		},
		{ timeout: 30_000 },
	);
});
