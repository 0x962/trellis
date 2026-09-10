import { beforeAll, describe, expect, test } from "bun:test";
import { search } from "../../src/db/queries/search.ts";
import type { TestDb } from "../helpers/db.ts";
import { p95 } from "./measure.ts";
import { BUDGET_FACTOR, PERF_ROWS, perfDb } from "./seed.ts";

// plan.md, Performance requirements: `search.query` p95 at 50k is 40 ms.
let db: TestDb["db"];
beforeAll(async () => {
	if (PERF_ROWS === 0) return;
	db = (await perfDb()).db;
}, 600_000);

describe.skipIf(PERF_ROWS === 0)(`perf search at ${PERF_ROWS} rows`, () => {
	test("search.query p95 for a word is within budget", async () => {
		const ms = await p95(() => db.transaction((tx) => search(tx, { q: "billing" })));
		expect(ms).toBeLessThanOrEqual(40 * BUDGET_FACTOR);
	});

	test("search.query p95 for a prefix is within budget", async () => {
		const ms = await p95(() => db.transaction((tx) => search(tx, { q: "bill" })));
		expect(ms).toBeLessThanOrEqual(40 * BUDGET_FACTOR);
	});
});
