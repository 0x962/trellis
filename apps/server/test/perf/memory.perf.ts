import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createTrellisClient } from "@trellis/api";
import { freshHome } from "../helpers/home.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../helpers/server.ts";
import { memoryOf } from "./footprint.ts";
import { report } from "./measure.ts";
import { type PerfServer, startPerfServer } from "./perfServer.ts";
import { READ_MIX } from "./queries.ts";
import { PERF_ROWS } from "./seed.ts";

// The memory budgets: the server holds 350 MB or less while it
// waits for requests, and 550 MB or less at its peak. The measure is the
// physical footprint on macOS and the resident size on Linux (footprint.ts).
// Each test prints the resident size beside it. A first boot on an empty
// home creates the database cluster, so the first test covers the costliest
// boot.

const IDLE_BUDGET_MB = 350;
const PEAK_BUDGET_MB = 550;

// The memory is flat from about 2 seconds after listening.
const SETTLE_MS = 3000;

// The reads of one person's busy hour. Memory grew over the first 300 of
// these and then stayed high, so the load runs well past that point.
const QUERIES = 1400;
const SAMPLE_EVERY = 50;

// Prints the footprint and the resident size, and returns the footprint.
const measure = async (metric: string, pid: number, budget: number) => {
	const { rss, footprint } = await memoryOf(pid);
	report(`${metric} rss`, rss, budget, "MB");
	return report(`${metric} footprint`, footprint, budget, "MB");
};

const servers: SpawnedServer[] = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
});

describe("memory budget", () => {
	test(
		"a first boot on an empty home idles at 350 MB or less",
		async () => {
			const server = spawnServer({ home: freshHome() });
			servers.push(server);
			await server.listening();
			await Bun.sleep(SETTLE_MS);

			const footprint = await measure("first boot idle", server.proc.pid, IDLE_BUDGET_MB);

			expect(footprint).toBeLessThanOrEqual(IDLE_BUDGET_MB);
		},
		{ timeout: 30_000 },
	);
});

// The tests of this block run in order on one server: idle after boot, the
// peak under load, then idle again after the load.
describe.skipIf(PERF_ROWS === 0)(`memory budget at ${PERF_ROWS} rows`, () => {
	let server: PerfServer;
	let pid: number;
	beforeAll(async () => {
		server = await startPerfServer();
		pid = server.process.proc.pid;
	}, 600_000);
	afterAll(() => server.stop());

	test(
		"the server on the seeded home idles at 350 MB or less",
		async () => {
			await Bun.sleep(SETTLE_MS);
			expect(await measure("idle", pid, IDLE_BUDGET_MB)).toBeLessThanOrEqual(IDLE_BUDGET_MB);
		},
		{ timeout: 30_000 },
	);

	test(
		`memory peaks at 550 MB or less through ${QUERIES} list and search queries`,
		async () => {
			const client = createTrellisClient(server.url, "agent:perf");
			let peakFootprint = 0;
			let peakRss = 0;
			for (let i = 1; i <= QUERIES; i++) {
				await READ_MIX[i % READ_MIX.length]!(client);
				if (i % SAMPLE_EVERY === 0) {
					const { rss, footprint } = await memoryOf(pid);
					peakFootprint = Math.max(peakFootprint, footprint);
					peakRss = Math.max(peakRss, rss);
				}
			}
			report("peak rss", peakRss, PEAK_BUDGET_MB, "MB");
			expect(report("peak footprint", peakFootprint, PEAK_BUDGET_MB, "MB")).toBeLessThanOrEqual(PEAK_BUDGET_MB);
		},
		{ timeout: 600_000 },
	);

	test(
		"after the queries the server idles at 350 MB or less again",
		async () => {
			await Bun.sleep(SETTLE_MS);
			expect(await measure("idle after use", pid, IDLE_BUDGET_MB)).toBeLessThanOrEqual(IDLE_BUDGET_MB);
		},
		{ timeout: 30_000 },
	);
});
