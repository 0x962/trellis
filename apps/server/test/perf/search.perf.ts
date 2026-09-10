import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { search } from "../../src/db/queries/search.ts";
import type { TestDb } from "../helpers/db.ts";
import { budget, p95, p95Of, report } from "./measure.ts";
import { type PerfServer, startPerfServer, type TimedClient, timedClient } from "./perfServer.ts";
import { PERF_ROWS, perfDb } from "./seed.ts";

// plan.md, Performance requirements: `search.query` p95 at 50k is 40 ms, and
// 3 ms for a `KEY-n` identifier.
let db: TestDb["db"];
beforeAll(async () => {
	if (PERF_ROWS === 0) return;
	db = (await perfDb()).db;
}, 600_000);

describe.skipIf(PERF_ROWS === 0)(`perf search at ${PERF_ROWS} rows`, () => {
	test("search.query p95 for a word is within budget", async () => {
		const ms = await p95(() => db.transaction((tx) => search(tx, { q: "billing" })));
		expect(ms).toBeLessThanOrEqual(budget(40));
	});

	test("search.query p95 for a prefix is within budget", async () => {
		const ms = await p95(() => db.transaction((tx) => search(tx, { q: "bill" })));
		expect(ms).toBeLessThanOrEqual(budget(40));
	});
});

// The same budgets through the real server on the seeded home. Each sample
// is the db duration the server reports in its Server-Timing header.
describe.skipIf(PERF_ROWS === 0)(`perf search over HTTP at ${PERF_ROWS} rows`, () => {
	let server: PerfServer;
	let api: TimedClient;
	beforeAll(async () => {
		server = await startPerfServer();
		api = timedClient(server.url);
	}, 600_000);
	afterAll(() => server.stop());

	test("search.query p95 from Server-Timing for a word is within budget", async () => {
		const ms = await p95Of(() => api.timed((client) => client.search.query({ q: "billing" })));
		expect(report("search word p95", ms, budget(40))).toBeLessThanOrEqual(budget(40));
	});

	test("search.query p95 from Server-Timing for a prefix is within budget", async () => {
		const ms = await p95Of(() => api.timed((client) => client.search.query({ q: "bill" })));
		expect(report("search prefix p95", ms, budget(40))).toBeLessThanOrEqual(budget(40));
	});

	test("search.query p95 from Server-Timing for a KEY-n identifier is within budget", async () => {
		const ms = await p95Of(() => api.timed((client) => client.search.query({ q: "AAA-42" })));
		expect(report("search KEY-n p95", ms, budget(3))).toBeLessThanOrEqual(budget(3));
	});
});
