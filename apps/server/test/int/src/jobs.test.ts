import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { fakeTimerClock } from "../../helpers/clock.ts";
import { freshDb, type TestDb } from "../../helpers/db.ts";
import { BASE } from "../../helpers/poller.ts";
import { createBus } from "../../../src/events/bus.ts";
import type { GhResult, GhRunner } from "../../../src/gh/run.ts";
import { MAINTENANCE_MS, POLLER_DRAIN_MS, startJobs } from "../../../src/jobs.ts";

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

const setup = (gh: GhRunner, db: TestDb["db"] = h.db) => {
	const clock = fakeTimerClock(BASE);
	const bus = createBus({ bootId: ulid() });
	const logs: Array<{ msg: string; fields?: Record<string, unknown> }> = [];
	const jobs = startJobs({
		db,
		gh,
		bus,
		log: (msg, fields) => void logs.push({ msg, fields }),
		clock,
	});
	// A `statuses.changed` event stands for one committed write. A `gh.status`
	// event writes no row, and the poller emits one on its first tick.
	const writes = (count: number) => {
		const event: TrellisEvent = { type: "statuses.changed", projectId: ulid() };
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

// The jobs run on the database worker. A job that throws must not reject
// into the worker, because an unhandled rejection stops the worker and the
// server then answers no request.
describe("a failed job", () => {
	test("a poller tick that throws logs the error, and the next tick runs", async () => {
		const calls: string[][] = [];
		const throwingGh = Object.assign(
			async (_slot: string, args: string[]): Promise<GhResult> => {
				calls.push(args);
				throw new Error("gh exploded");
			},
			{ bin: "gh", timeoutMs: 30_000 },
		) as GhRunner;
		const { clock, logs, jobs } = setup(throwingGh);

		await clock.advance(10_000);
		expect(logs.filter((line) => line.msg === "poller tick failed").map((line) => line.fields?.message)).toEqual([
			"gh exploded",
		]);

		await clock.advance(10_000);
		expect(calls).toHaveLength(2);
		await jobs.stop();
	});

	test("a vacuum that throws logs the error, and the timer runs again", async () => {
		const failingDb = {
			execute: async () => {
				throw new Error("disk full");
			},
		} as unknown as TestDb["db"];
		const { clock, logs, jobs, writes } = setup(missingGh, failingDb);
		writes(1001);

		await clock.advance(MAINTENANCE_MS);
		await clock.advance(MAINTENANCE_MS);

		expect(logs.filter((line) => line.msg === "vacuum failed").map((line) => line.fields?.message)).toEqual([
			"disk full",
			"disk full",
		]);
		await jobs.stop();
	});
});
