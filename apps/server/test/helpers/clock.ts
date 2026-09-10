// Two fake clocks a test moves by hand. The SSE route repeats work on an
// interval; the pull request poller arms one timer at a time. Each clock
// matches the shape its caller takes, so neither test waits in real time.

// A clock the SSE route reads instead of the wall clock. `advance` moves the
// time and runs every interval that falls due, in order, so a test proves a
// ping at 15 s without a 15 s wait. The shape matches the `Clock` the app
// takes: `now`, `setInterval`, and `clearInterval`.

export type Clock = {
	now: () => Date;
	setInterval: (fn: () => void, ms: number) => unknown;
	clearInterval: (handle: unknown) => void;
};

type Interval = { fn: () => void; ms: number; due: number };

export type FakeIntervalClock = Clock & { advance: (ms: number) => void; intervals: () => number };

export const fakeIntervalClock = (start = new Date("2026-09-09T12:00:00.000Z")): FakeIntervalClock => {
	let time = start.getTime();
	const intervals = new Map<symbol, Interval>();
	return {
		now: () => new Date(time),
		setInterval: (fn, ms) => {
			const handle = Symbol("interval");
			intervals.set(handle, { fn, ms, due: time + ms });
			return handle;
		},
		clearInterval: (handle) => {
			intervals.delete(handle as symbol);
		},
		advance: (ms) => {
			const target = time + ms;
			for (;;) {
				const next = [...intervals.values()].filter((entry) => entry.due <= target).sort((a, b) => a.due - b.due)[0];
				if (next === undefined) break;
				time = next.due;
				next.due += next.ms;
				next.fn();
			}
			time = target;
		},
		intervals: () => intervals.size,
	};
};

// A clock the pull request poller reads. `setTimer` and `clearTimer` stand in
// for setTimeout and clearTimeout, and `now` reads the same fake instant
// every caller sees.
//
// `advance` moves the reading to each due timer in turn, runs that timer,
// and waits for what the timer returns. A timer callback that returns its
// own promise therefore settles before the clock moves on, so a test reads
// the database right after `advance` and never sleeps.

export type FakeTimer = { id: number; at: number; fn: () => unknown };

export type FakeTimerClock = {
	now: () => Date;
	nowMs: () => number;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
	timers: () => FakeTimer[];
	advance: (ms: number) => Promise<void>;
};

export const fakeTimerClock = (start: Date): FakeTimerClock => {
	let reading = start.getTime();
	let nextId = 1;
	let armed: FakeTimer[] = [];

	// The earliest timer at or before `target`, or undefined when none is due.
	const due = (target: number) => armed.filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at)[0];

	return {
		now: () => new Date(reading),
		nowMs: () => reading,
		setTimer: (fn, ms) => {
			const id = nextId++;
			armed.push({ id, at: reading + ms, fn });
			return id;
		},
		clearTimer: (id) => {
			armed = armed.filter((timer) => timer.id !== id);
		},
		timers: () => [...armed],
		advance: async (ms) => {
			const target = reading + ms;
			for (let next = due(target); next !== undefined; next = due(target)) {
				armed = armed.filter((timer) => timer.id !== next.id);
				reading = next.at;
				await next.fn();
			}
			reading = target;
		},
	};
};
