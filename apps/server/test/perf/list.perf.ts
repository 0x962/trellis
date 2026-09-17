import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { board } from "../../src/db/queries/board.ts";
import { counts } from "../../src/db/queries/counts.ts";
import { ticketList } from "../../src/db/queries/ticketList.ts";
import type { TestDb } from "../helpers/db.ts";
import { budget, LIST_BUDGET_MS, p95, p95Of, report } from "./measure.ts";
import { type PerfServer, startPerfServer, type TimedClient, timedClient } from "./perfServer.ts";
import { TABLE_QUERY } from "./queries.ts";
import { PERF_ROWS, type PerfRoot, perfDb } from "./seed.ts";

// ARCHITECTURE.md, Performance budgets: `tickets.list` p95 for the default
// table query of 50 rows is 5 ms at 1k, 10 ms at 10k, and 20 ms at 50k;
// 40 ms with `q`. `tickets.board` and `tickets.counts` are 30 ms each.
const listBudget = LIST_BUDGET_MS;

let db: TestDb["db"];
let root: PerfRoot;
beforeAll(async () => {
	if (PERF_ROWS === 0) return;
	const seeded = await perfDb();
	db = seeded.db;
	root = seeded.roots[0] as PerfRoot;
}, 600_000);

// The heaviest table query: the subtree of one root, its open categories,
// newest first, one page of 50. A project view asks for one project, so this
// query reads more rows than any view sends.
const table = () => ({
	rootIds: [root.rootId],
	projectIds: root.projectIds,
	categories: ["todo", "started", "review"] as const,
});

describe.skipIf(PERF_ROWS === 0)(`perf list at ${PERF_ROWS} rows`, () => {
	test("tickets.list default table query p95 is within budget", async () => {
		const ms = await p95(() => db.transaction((tx) => ticketList(tx, { ...table(), limit: 50 })));
		expect(ms).toBeLessThanOrEqual(budget(listBudget));
	});

	test("tickets.list with q p95 is within budget", async () => {
		const ms = await p95(() => db.transaction((tx) => ticketList(tx, { ...table(), q: "billing", limit: 50 })));
		expect(ms).toBeLessThanOrEqual(budget(40));
	});

	test("tickets.board p95 is within budget", async () => {
		const statusIds = Object.values(root.statuses);
		const ms = await p95(() =>
			db.transaction((tx) => board(tx, { rootIds: [root.rootId], projectIds: root.projectIds, statusIds })),
		);
		expect(ms).toBeLessThanOrEqual(budget(30));
	});

	test("tickets.counts p95 is within budget", async () => {
		const statusIds = Object.values(root.statuses);
		const ms = await p95(() =>
			db.transaction((tx) => counts(tx, { rootIds: [root.rootId], projectIds: root.projectIds, statusIds })),
		);
		expect(ms).toBeLessThanOrEqual(budget(30));
	});
});

// The same budgets through the real server on the seeded home. Each sample
// is the db duration the server reports in its Server-Timing header.
describe.skipIf(PERF_ROWS === 0)(`perf list over HTTP at ${PERF_ROWS} rows`, () => {
	let server: PerfServer;
	let api: TimedClient;
	beforeAll(async () => {
		server = await startPerfServer();
		api = timedClient(server.url);
	}, 600_000);
	afterAll(() => server.stop());

	test("tickets.list default table query p95 from Server-Timing is within budget", async () => {
		const ms = await p95Of(() => api.timed((client) => client.tickets.list(TABLE_QUERY)));
		expect(report("tickets.list p95", ms, budget(listBudget))).toBeLessThanOrEqual(budget(listBudget));
	});

	test("tickets.list with q p95 from Server-Timing is within budget", async () => {
		const ms = await p95Of(() => api.timed((client) => client.tickets.list({ ...TABLE_QUERY, q: "billing" })));
		expect(report("tickets.list q p95", ms, budget(40))).toBeLessThanOrEqual(budget(40));
	});

	test("tickets.board p95 from Server-Timing is within budget", async () => {
		const ms = await p95Of(() => api.timed((client) => client.tickets.board({ project: "AAA" })));
		expect(report("tickets.board p95", ms, budget(30))).toBeLessThanOrEqual(budget(30));
	});

	test("tickets.counts p95 from Server-Timing is within budget", async () => {
		const ms = await p95Of(() => api.timed((client) => client.tickets.counts({ project: "AAA" })));
		expect(report("tickets.counts p95", ms, budget(30))).toBeLessThanOrEqual(budget(30));
	});
});
