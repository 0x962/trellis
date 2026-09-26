type Options = {
	tick: () => Promise<unknown>;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
	log: (message: string, fields?: Record<string, unknown>) => void;
	intervalMs?: number;
	allowConcurrentTicks?: boolean;
};
export function startNativeReconcile(options: Options) {
	let stopped = false;
	let timer: number | null = null;
	const inflightTicks = new Set<Promise<void>>();
	const schedule = () => {
		if (stopped) return;
		timer = options.setTimer(() => {
			timer = null;
			return tick();
		}, options.intervalMs ?? 1000);
	};
	const tick = (): Promise<void> => {
		if (stopped) return Promise.resolve();
		if (!options.allowConcurrentTicks && inflightTicks.size > 0) return inflightTicks.values().next().value!;
		if (timer !== null) {
			options.clearTimer(timer);
			timer = null;
		}
		if (options.allowConcurrentTicks) schedule();
		const tickRun = options
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
				inflightTicks.delete(tickRun);
				if (!options.allowConcurrentTicks) schedule();
			});
		inflightTicks.add(tickRun);
		return tickRun;
	};
	void tick();
	return {
		tick,
		async stop() {
			stopped = true;
			if (timer !== null) options.clearTimer(timer);
			timer = null;
			await Promise.all(inflightTicks);
		},
	};
}
