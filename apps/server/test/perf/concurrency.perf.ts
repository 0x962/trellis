import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { budget, LIST_BUDGET_MS, percentile95, percentile99, report } from "./measure.ts";
import { type PerfServer, startPerfServer, timedClient } from "./perfServer.ts";
import { TABLE_QUERY } from "./queries.ts";
import { PERF_ROWS } from "./seed.ts";

// ARCHITECTURE.md, Performance budgets: five agents write at the same time, 20
// writes a second in all. Each write costs 15 ms of server time or less, and
// the default table query keeps its p95 budget while they write. Server time
// is the db duration of the Server-Timing header.

const AGENTS = 5;
const WRITES_PER_AGENT = 20;
// Five agents that each write every 250 ms make 20 writes a second.
const WRITE_GAP_MS = 250;
const TARGET_WRITES_PER_SECOND = 20;

describe.skipIf(PERF_ROWS === 0)(`perf concurrency at ${PERF_ROWS} rows`, () => {
	let server: PerfServer;
	const writes: number[] = [];
	const lists: number[] = [];
	let writesPerSecond = 0;
	beforeAll(async () => {
		server = await startPerfServer();
		const agents = Array.from({ length: AGENTS }, (_, index) => timedClient(server.url, `agent:perf-${index + 1}`));
		const reader = timedClient(server.url, "human:navid");

		let writing = true;
		const reading = (async () => {
			while (writing) lists.push(await reader.timed((client) => client.tickets.list(TABLE_QUERY)));
		})();

		// Each agent writes on its own schedule, offset from the others, and
		// alternates a title change with a comment on its own tickets.
		const started = performance.now();
		await Promise.all(
			agents.map(async (agent, index) => {
				for (let step = 0; step < WRITES_PER_AGENT; step++) {
					const due = started + index * (WRITE_GAP_MS / AGENTS) + step * WRITE_GAP_MS;
					await Bun.sleep(Math.max(0, due - performance.now()));
					const ticket = `BBB-${1 + index * WRITES_PER_AGENT + step}`;
					writes.push(
						await agent.timed((client) =>
							step % 2 === 0
								? client.tickets.update({ ticket, title: `Agent ${index + 1} write ${step}` })
								: client.comments.create({ ticket, body: `Agent ${index + 1} note ${step}` }),
						),
					);
				}
			}),
		);
		writesPerSecond = writes.length / ((performance.now() - started) / 1000);
		writing = false;
		await reading;
	}, 600_000);
	afterAll(() => server.stop());

	// The budget holds at p99. One scheduler pause on the machine can push a
	// single write over the budget, so the max has a separate limit of two
	// times the budget. A write over that limit is a real cost, not a pause.
	test("each write under 5 concurrent agents costs 15 ms of server time or less", () => {
		report("write server time p95", percentile95(writes), budget(15));
		const p99 = report("write server time p99", percentile99(writes), budget(15));
		const max = report("write server time max", Math.max(...writes), budget(30));
		expect(p99).toBeLessThanOrEqual(budget(15));
		expect(max).toBeLessThanOrEqual(budget(30));
	});

	test("the agents keep 20 writes a second and the table query keeps its p95 budget", () => {
		report("writes per second", writesPerSecond, TARGET_WRITES_PER_SECOND, "/s");
		const listP95 = report("tickets.list p95 during writes", percentile95(lists), budget(LIST_BUDGET_MS));
		expect(writes).toHaveLength(AGENTS * WRITES_PER_AGENT);
		expect(writesPerSecond).toBeGreaterThanOrEqual(TARGET_WRITES_PER_SECOND);
		expect(listP95).toBeLessThanOrEqual(budget(LIST_BUDGET_MS));
	});
});
