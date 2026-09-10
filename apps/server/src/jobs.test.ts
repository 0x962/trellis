import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { fakeTimerClock } from "../test/helpers/clock.ts";
import { freshDb, type TestDb } from "../test/helpers/db.ts";
import { BASE } from "../test/helpers/poller.ts";
import { createBus } from "./events/bus.ts";
import type { GhResult, GhRunner } from "./gh/run.ts";
import { MAINTENANCE_MS, POLLER_DRAIN_MS, startJobs } from "./jobs.ts";

// The jobs run in the thread that owns the database: the pull request poller
// and the maintenance timer. Every event on the bus counts as one write.
// Every 10 minutes the timer vacuums the busy tables when more than 1000
// writes happened. A stop waits for the poller tick in flight, up to 5 s.

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
afterAll(() => h.close());

const missingGh = Object.assign(async (): Promise<GhResult> => ({ ok: false, reason: "missing", message: "no gh" }), {
	bin: "gh",
	timeoutMs: 30_000,
}) as GhRunner;

// A gh whose calls wait until the test releases them.
const gatedGh = () => {
	const gate = Promise.withResolvers<void>();
	const calls: string[][] = [];
	const gh = Object.assign(
		async (_slot: string, args: string[]): Promise<GhResult> => {
			calls.push(args);
			await gate.promise;
			return { ok: false, reason: "missing", message: "no gh" };
		},
		{ bin: "gh", timeoutMs: 30_000 },
	) as GhRunner;
	return { gh, calls, release: gate.resolve };
};

const vacuumCount = async () => {
	const found = await h.db.execute(
		sql`SELECT vacuum_count::int AS n FROM pg_stat_user_tables WHERE relname = 'tickets'`,
	);
	return found.rows[0]!.n as number;
};

const setup = (gh: GhRunner) => {
	const clock = fakeTimerClock(BASE);
	const bus = createBus({ bootId: ulid() });
	const logs: Array<{ msg: string; fields?: Record<string, unknown> }> = [];
	const jobs = startJobs({
		db: h.db,
		gh,
		bus,
		log: (msg, fields) => void logs.push({ msg, fields }),
		clock,
	});
	const writes = (count: number) => {
		const event: TrellisEvent = { type: "gh.status", ok: true };
		for (let index = 0; index < count; index++) bus.emit(event);
	};
	return { clock, bus, logs, jobs, writes };
};

describe("maintenance", () => {
	test("the timer vacuums the busy tables after more than 1000 writes", async () => {
		const { clock, logs, jobs, writes } = setup(missingGh);
		const before = await vacuumCount();

		writes(1000);
		await clock.advance(MAINTENANCE_MS);
		expect(await vacuumCount()).toBe(before);

		writes(1);
		await clock.advance(MAINTENANCE_MS);
		expect(await vacuumCount()).toBe(before + 1);
		expect(logs.filter((line) => line.msg === "vacuum")).toEqual([{ msg: "vacuum", fields: { writes: 1001 } }]);

		await clock.advance(MAINTENANCE_MS);
		expect(await vacuumCount()).toBe(before + 1);
		await jobs.stop();
	});
});

describe("stop", () => {
	test("stop waits for the poller tick in flight", async () => {
		const gated = gatedGh();
		const { clock, logs, jobs } = setup(gated.gh);
		const moving = clock.advance(10_000);
		while (gated.calls.length === 0) await Bun.sleep(5);

		let stopped = false;
		const stopping = jobs.stop().then(() => {
			stopped = true;
		});
		await Bun.sleep(50);
		expect(stopped).toBe(false);

		gated.release();
		await Promise.all([stopping, moving]);
		expect(logs.find((line) => line.msg === "poller stopped")).toEqual({
			msg: "poller stopped",
			fields: { drained: true },
		});
	});

	test("stop gives up on a tick that runs past the 5 s deadline", async () => {
		const gated = gatedGh();
		const { clock, logs, jobs } = setup(gated.gh);
		void clock.advance(10_000);
		while (gated.calls.length === 0) await Bun.sleep(5);

		const started = Date.now();
		await jobs.stop();
		const elapsed = Date.now() - started;

		expect(elapsed).toBeGreaterThanOrEqual(POLLER_DRAIN_MS - 50);
		expect(elapsed).toBeLessThan(POLLER_DRAIN_MS + 1000);
		expect(logs.find((line) => line.msg === "poller stopped")).toEqual({
			msg: "poller stopped",
			fields: { drained: false },
		});
		gated.release();
	}, 10_000);

	test("no timer fires after stop", async () => {
		const { clock, jobs, writes } = setup(missingGh);
		const before = await vacuumCount();
		writes(2000);

		await jobs.stop();
		await clock.advance(MAINTENANCE_MS * 2);

		expect(clock.timers()).toEqual([]);
		expect(await vacuumCount()).toBe(before);
	});
});
