export type Timers = {
	set: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clear: (timer: ReturnType<typeof setTimeout>) => void;
};

const browserTimers: Timers = { set: (run, ms) => setTimeout(run, ms), clear: (timer) => clearTimeout(timer) };

// Saves a text while a person types in it. `change` waits `delayMs` after the
// last keystroke, and `flush` saves at once, for a blur or a closed document.
// `save` runs only for a text that differs from the last text it received, so
// a blur right after the pause sends nothing twice.
export const typingSaver = (save: (text: string) => void, saved: string, delayMs: number, timers = browserTimers) => {
	let last = saved;
	let pending = saved;
	let timer: ReturnType<typeof setTimeout> | null = null;
	const flush = () => {
		if (timer !== null) timers.clear(timer);
		timer = null;
		if (pending === last) return;
		last = pending;
		save(pending);
	};
	return {
		change: (text: string) => {
			pending = text;
			if (timer !== null) timers.clear(timer);
			timer = timers.set(flush, delayMs);
		},
		flush,
	};
};
