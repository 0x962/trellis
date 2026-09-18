import type { JobsClock, JobsLog } from "../jobs.ts";

export function startCommentDeliveryLoop(options: {
	call: () => Promise<unknown>;
	clock: JobsClock;
	log: JobsLog;
}) {
	let timer: number | null = null;
	let running: Promise<void> = Promise.resolve();
	let stopped = false;
	const tick = () => {
		timer = null;
		running = options
			.call()
			.catch((error: unknown) =>
				options.log("comment delivery failed", { error: error instanceof Error ? error.message : String(error) }),
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
