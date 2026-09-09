import type { Scheduler } from "../src/scheduler.ts";

// A scheduler whose clock moves only when a test calls `advanceTo`. A timer
// runs when the clock reaches its due time, in due-time order, with `now()`
// equal to that due time while it runs. The coalescer tests read every
// timestamp from this clock, so no test depends on Date.now.
export const createFakeScheduler = () => {
	let now = 0;
	let nextHandle = 1;
	const timers = new Map<number, { at: number; callback: () => void }>();

	const scheduler: Scheduler = {
		now: () => now,
		setTimeout: (callback, delayMs) => {
			const handle = nextHandle++;
			timers.set(handle, { at: now + delayMs, callback });
			return handle;
		},
		clearTimeout: (handle) => {
			timers.delete(handle as number);
		},
	};

	const advanceTo = (time: number) => {
		for (;;) {
			const due = [...timers.entries()].filter(([, timer]) => timer.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
			if (due === undefined) break;
			timers.delete(due[0]);
			now = due[1].at;
			due[1].callback();
		}
		now = time;
	};

	return { scheduler, advanceTo, pendingTimers: () => timers.size };
};
