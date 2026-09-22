import type { ProjectCache } from "./db/cache.ts";
import { createMaintenance, VACUUM_AFTER_WRITES } from "./db/maintenance.ts";
import type { withTx } from "./db/tx.ts";
import type { Bus } from "./events/bus.ts";
import * as poller from "./gh/poller.ts";
import type { GhRunner } from "./gh/run.ts";

// The work that runs beside the requests, in the thread that owns the
// database: the pull request poller and the maintenance timer.
//
// Every event on the bus counts as one write, except `gh.status`, which
// reports the state of gh and writes no row. A committed mutation and a
// poller write both put their events on the bus. Every 10 minutes the
// maintenance timer vacuums the busy tables when more than 1000 writes
// happened since the last vacuum, because PGlite runs no autovacuum.

type Db = Parameters<typeof withTx>[0];

// `setTimer` and `clearTimer` stand in for setTimeout and clearTimeout, so a
// test moves the clock by hand.
export type JobsClock = {
	now: () => Date;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
};

export type JobsLog = (msg: string, fields?: Record<string, unknown>) => void;

export type JobsOptions = {
	db: Db;
	cache: ProjectCache;
	actorCache: Map<string, number>;
	publicUrl: string;
	gh: GhRunner;
	bus: Bus;
	log: JobsLog;
	clock: JobsClock;
};

export type Jobs = { stop: () => Promise<void> };

export const MAINTENANCE_MS = 600_000;

// A shutdown waits this long for the poller tick in flight. A tick that runs
// longer is abandoned, and the database closes under it.
export const POLLER_DRAIN_MS = 5_000;

// A clock that runs `rate` times faster than the wall clock. At rate 100 the
// 10 s poller tick fires every 100 ms, so a test sees a cadence without a
// long wait. The server runs at rate 1.
export const scaledClock = (rate: number): JobsClock => {
	const start = Date.now();
	const timers = new Map<number, ReturnType<typeof setTimeout>>();
	let nextId = 1;
	return {
		now: () => new Date(start + (Date.now() - start) * rate),
		setTimer: (fn, ms) => {
			const id = nextId++;
			timers.set(
				id,
				setTimeout(() => {
					timers.delete(id);
					fn();
				}, ms / rate),
			);
			return id;
		},
		clearTimer: (id) => {
			clearTimeout(timers.get(id));
			timers.delete(id);
		},
	};
};

// Resolves true when `work` settles within `ms`, and false when the deadline
// comes first. The deadline timer is cleared either way.
const within = async (work: Promise<void>, ms: number) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), ms);
	});
	const settled = await Promise.race([work.then(() => true as const), deadline]);
	clearTimeout(timer);
	return settled;
};

export const startJobs = ({ db, cache, actorCache, publicUrl, gh, bus, log, clock }: JobsOptions): Jobs => {
	const maintenance = createMaintenance(db);
	const unsubscribe = bus.subscribe(({ event }) => {
		if (event.type !== "gh.status") maintenance.recordWrites(1);
	});
	const handle = poller.start({
		db,
		cache,
		actorCache,
		publicUrl,
		gh,
		sink: (events) => {
			for (const event of events) bus.emit(event);
		},
		log: (msg, fields) => log(msg as string, fields as Record<string, unknown> | undefined),
		now: clock.now,
		setTimer: clock.setTimer,
		clearTimer: clock.clearTimer,
	});

	let timer: number | null = null;
	let running: Promise<void> = Promise.resolve();
	let stopped = false;

	// The timer runs on the database worker, and a rejected vacuum there stops
	// the worker. So a vacuum that throws writes one log line, and the timer
	// arms again. The writes stay pending, so the next run tries again.
	const vacuum = () => {
		timer = null;
		const writes = maintenance.pendingWrites;
		running = maintenance
			.tick()
			.then(
				() => {
					if (writes > VACUUM_AFTER_WRITES) log("vacuum", { writes });
				},
				(error: Error) => log("vacuum failed", { message: error.message, stack: error.stack }),
			)
			.then(() => {
				if (!stopped) arm();
			});
		return running;
	};
	const arm = () => {
		timer = clock.setTimer(vacuum, MAINTENANCE_MS);
	};
	arm();

	return {
		stop: async () => {
			stopped = true;
			if (timer !== null) clock.clearTimer(timer);
			const drained = await within(handle.stop(), POLLER_DRAIN_MS);
			log("poller stopped", { drained });
			await running;
			unsubscribe();
		},
	};
};
