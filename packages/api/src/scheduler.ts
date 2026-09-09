// The clock and the timers the invalidation coalescer uses. A test injects a
// fake one, so no test waits on real time.
export type Scheduler = {
	now: () => number;
	setTimeout: (callback: () => void, delayMs: number) => unknown;
	clearTimeout: (handle: unknown) => void;
};

export const realScheduler: Scheduler = {
	now: () => Date.now(),
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
