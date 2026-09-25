type BackfillResult = { updated: number; pending: boolean };

type Options = {
	backfill: () => Promise<BackfillResult>;
	setTimer: (fn: () => unknown, ms: number) => number;
	clearTimer: (id: number) => void;
	log: (message: string, fields?: Record<string, unknown>) => void;
};

export const PAGE_SEARCH_BACKFILL_INTERVAL_MS = 100;

export const startSearchBackfill = async ({ backfill, setTimer, clearTimer, log }: Options) => {
	let stopped = false;
	let timer: number | null = null;
	let active: Promise<void> | null = null;

	const tick = async () => {
		const result = await backfill();
		if (result.updated > 0) log("page search backfill", { updated: result.updated });
		if (result.pending && !stopped) timer = setTimer(run, PAGE_SEARCH_BACKFILL_INTERVAL_MS);
	};
	const run = () => {
		timer = null;
		active = tick().catch((error: unknown) => {
			stopped = true;
			log("page search backfill failed", { error: error instanceof Error ? error.message : String(error) });
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
