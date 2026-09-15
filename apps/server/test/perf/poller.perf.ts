import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import * as poller from "../../src/gh/poller.ts";
import { graphqlReply } from "../fixtures";
import { freshDb, type TestDb } from "../helpers/db.ts";
import { authReply, pollerHarness, spawnKey } from "../helpers/poller.ts";
import { OPEN_PULL_REQUESTS, seedPerf } from "./pollerSeed.ts";

// One tick over the 10k seed spawns four gh processes for its 40 due pull
// requests and costs 250 ms of cpu or less, so a poller on a busy tree stays
// out of the way of the requests a person waits for.

const CPU_BUDGET_MS = 250;

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
afterAll(() => h.close());

const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});

describe("poller perf", () => {
	test("one tick over 40 due pull requests costs four gh spawns and 250 ms of cpu or less", async () => {
		await seedPerf(h.db, { tickets: 10_000 });
		const p = pollerHarness(h.db, {
			"auth status": authReply,
			"api graphql": graphqlReply(Array.from({ length: 50 }, () => ({ number: 1 }))),
		});
		restores.push(p.restore);
		const handle = poller.start(p.hook);

		const before = process.cpuUsage();
		await handle.tick();
		const spent = process.cpuUsage(before);

		expect(p.spawns().map(spawnKey)).toEqual(["auth status", ...Array(4).fill("api graphql")]);
		expect((spent.user + spent.system) / 1000).toBeLessThanOrEqual(CPU_BUDGET_MS);
		const fetched = await h.db.execute(
			sql`SELECT count(*)::int AS n FROM pull_requests WHERE content_hash IS NOT NULL`,
		);
		expect(fetched.rows[0]!.n).toBe(OPEN_PULL_REQUESTS);
		await handle.stop();
	}, 120_000);
});
