type Options = {
	sweep: () => Promise<unknown>;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
};

export const startPageRetention = async ({ sweep, setTimer, clearTimer }: Options) => {
	let stopped = false;
	let timer: number | null = null;
	let active: Promise<void>;
	const tick = () => {
		timer = null;
		active = sweep().then(() => {
			if (!stopped) timer = setTimer(tick, 60 * 60 * 1000);
		});
		return active;
	};
	await tick();
	return {
		async stop() {
			stopped = true;
			if (timer !== null) clearTimer(timer);
			await active;
		},
	};
};
