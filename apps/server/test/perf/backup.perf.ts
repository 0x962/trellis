import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { createTrellisClient } from "@trellis/api";
import { budget, report } from "./measure.ts";
import { type PerfServer, startPerfServer } from "./perfServer.ts";
import { PERF_ROWS } from "./seed.ts";

// ARCHITECTURE.md, Performance budgets: a backup at 50k holds the database for
// 1.5 s or less and finishes within 15 s. While the backup holds the
// database, every request waits, so the hold is the longest wait a reader
// sees during the backup.

describe.skipIf(PERF_ROWS === 0)(`perf backup at ${PERF_ROWS} rows`, () => {
	let server: PerfServer;
	let holdMs = 0;
	let totalMs = 0;
	let archive = "";
	beforeAll(async () => {
		server = await startPerfServer();
		const client = createTrellisClient(server.url, "human:navid");

		let backingUp = true;
		const reading = (async () => {
			let worst = 0;
			while (backingUp) {
				const started = performance.now();
				await client.tickets.counts({ project: "AAA" });
				worst = Math.max(worst, performance.now() - started);
			}
			return worst;
		})();
		await Bun.sleep(100);

		const started = performance.now();
		const written = await client.system.backup();
		totalMs = performance.now() - started;
		backingUp = false;
		holdMs = await reading;
		archive = written.path;
	}, 600_000);
	afterAll(() => server.stop());

	test("a backup holds the database for 1.5 s or less", () => {
		expect(report("backup hold", holdMs, budget(1500))).toBeLessThanOrEqual(budget(1500));
	});

	test("a backup finishes within 15 s", () => {
		expect(existsSync(archive)).toBe(true);
		expect(report("backup total", totalMs, budget(15_000))).toBeLessThanOrEqual(budget(15_000));
	});
});
