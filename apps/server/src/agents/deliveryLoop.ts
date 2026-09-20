import type { JobsClock, JobsLog } from "../jobs.ts";

// Calls one service once a second, and never twice at the same time. The
// next call is set only after the previous one settles, so a slow service
// cannot queue up work. `failureText` is what the log prints when the call
// throws.
export function startDeliveryLoop(options: {
	call: () => Promise<unknown>;
	clock: JobsClock;
	log: JobsLog;
	failureText: string;
}) {
	let timer: number | null = null;
	let running: Promise<void> = Promise.resolve();
	let stopped = false;
	const tick = () => {
		timer = null;
		running = options
			.call()
			.catch((error: unknown) =>
				options.log(options.failureText, { error: error instanceof Error ? error.message : String(error) }),
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

export type DeliveryLoopOptions = Omit<Parameters<typeof startDeliveryLoop>[0], "failureText">;
