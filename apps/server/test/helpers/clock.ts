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

export type FakeClock = Clock & { advance: (ms: number) => void; intervals: () => number };

export const fakeClock = (start = new Date("2026-09-09T12:00:00.000Z")): FakeClock => {
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
