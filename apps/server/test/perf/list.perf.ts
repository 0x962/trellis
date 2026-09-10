import { beforeAll, describe, expect, test } from "bun:test";
import { board } from "../../src/db/queries/board.ts";
import { counts } from "../../src/db/queries/counts.ts";
import { ticketList } from "../../src/db/queries/ticketList.ts";
import type { TestDb } from "../helpers/db.ts";
import { p95 } from "./measure.ts";
import { BUDGET_FACTOR, PERF_ROWS, type PerfRoot, perfDb } from "./seed.ts";

// plan.md, Performance requirements: `tickets.list` p95 for the default
// table query of 50 rows is 5 ms at 1k, 10 ms at 10k, and 20 ms at 50k;
// 40 ms with `q`. `tickets.board` and `tickets.counts` are 30 ms each.
const listBudget = PERF_ROWS <= 1_000 ? 5 : PERF_ROWS <= 10_000 ? 10 : 20;
const budget = (ms: number) => ms * BUDGET_FACTOR;

let db: TestDb["db"];
let root: PerfRoot;
beforeAll(async () => {
	if (PERF_ROWS === 0) return;
	const seeded = await perfDb();
	db = seeded.db;
	root = seeded.roots[0] as PerfRoot;
}, 600_000);

// The default table query: the subtree of one root, its open categories,
// newest first, one page of 50.
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
