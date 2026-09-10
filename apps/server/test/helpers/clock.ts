// A clock a test moves by hand. `setTimer` and `clearTimer` stand in for
// setTimeout and clearTimeout, and `now` reads the same fake instant every
// caller sees.
//
// `advance` moves the reading to each due timer in turn, runs that timer,
// and waits for what the timer returns. A timer callback that returns its
// own promise therefore settles before the clock moves on, so a test reads
// the database right after `advance` and never sleeps.

export type FakeTimer = { id: number; at: number; fn: () => unknown };

export type FakeClock = {
	now: () => Date;
	nowMs: () => number;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
	timers: () => FakeTimer[];
	advance: (ms: number) => Promise<void>;
};

export const fakeClock = (start: Date): FakeClock => {
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
