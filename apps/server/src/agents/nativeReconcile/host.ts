type Options = {
	tick: () => Promise<unknown>;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
	log: (message: string, fields?: Record<string, unknown>) => void;
	intervalMs?: number;
	overlap?: boolean;
};
export function startNativeReconcile(options: Options) {
	let stopped = false;
	let timer: number | null = null;
	const active = new Set<Promise<void>>();
	const schedule = () => {
		if (stopped) return;
		timer = options.setTimer(() => {
			timer = null;
			return tick();
		}, options.intervalMs ?? 1000);
	};
	const tick = (): Promise<void> => {
		if (stopped) return Promise.resolve();
		if (!options.overlap && active.size > 0) return active.values().next().value!;
		if (timer !== null) {
			options.clearTimer(timer);
			timer = null;
		}
		if (options.overlap) schedule();
		const work = options
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
				active.delete(work);
				if (!options.overlap) schedule();
			});
		active.add(work);
		return work;
	};
	void tick();
	return {
		tick,
		async stop() {
			stopped = true;
			if (timer !== null) options.clearTimer(timer);
			timer = null;
			await Promise.all(active);
		},
	};
}
