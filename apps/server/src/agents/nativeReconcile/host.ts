type Options = {
	tick: () => Promise<unknown>;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
	log: (message: string, fields?: Record<string, unknown>) => void;
	intervalMs?: number;
};
export function startNativeReconcile(options: Options) {
	let stopped = false;
	let timer: number | null = null;
	let active: Promise<void> | null = null;
	const schedule = () => {
		if (stopped) return;
		timer = options.setTimer(() => {
			timer = null;
			return tick();
		}, options.intervalMs ?? 1000);
	};
	const tick = (): Promise<void> => {
		if (stopped) return Promise.resolve();
		if (active) return active;
		if (timer !== null) {
			options.clearTimer(timer);
			timer = null;
		}
		active = options
			.tick()
			.then(
				() => {},
				(error) => {
					options.log("native reconciliation failed", {
						error: error instanceof Error ? error.message : String(error),
					});
				},
			)
			.finally(() => {
				active = null;
				schedule();
			});
		return active;
	};
	void tick();
	return {
		tick,
		async stop() {
			stopped = true;
			if (timer !== null) options.clearTimer(timer);
			timer = null;
			await active;
		},
	};
}
