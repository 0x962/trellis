import type { JobsClock, JobsLog } from "../jobs.ts";

// Calls one service once a second, and never twice at the same time. The
// next call is set only after the previous one settles, so a slow service
// cannot queue up work. `failureLogMessage` is what the log prints when the
// call throws.
export function startRepeatingCall(options: {
	call: () => Promise<unknown>;
	clock: JobsClock;
	log: JobsLog;
	failureLogMessage: string;
}) {
	let timer: number | null = null;
	let running: Promise<void> = Promise.resolve();
	let stopped = false;
	const tick = () => {
		timer = null;
		running = options
			.call()
			.catch((error: unknown) =>
				options.log(options.failureLogMessage, { error: error instanceof Error ? error.message : String(error) }),
			)
			.then(() => {
				if (!stopped) timer = options.clock.setTimer(tick, 1000);
			});
	};
	timer = options.clock.setTimer(tick, 0);
	return {
		stop: async () => {
			stopped = true;
			if (timer !== null) options.clock.clearTimer(timer);
			await running;
		},
	};
}

export type RepeatingCallOptions = Omit<Parameters<typeof startRepeatingCall>[0], "failureLogMessage">;
