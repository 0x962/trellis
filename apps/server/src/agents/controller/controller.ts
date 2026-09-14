import type { JobsClock, JobsLog } from "../../jobs.ts";

export type ControllerOptions = {
	call: (
		name: "controller.recover" | "controller.collect" | "controller.dispatch",
		input: Record<string, never>,
	) => Promise<unknown>;
	clock: JobsClock;
	log: JobsLog;
};

export const createController = (options: ControllerOptions) => {
	let timer: number | null = null;
	let stopped = true;
	let running: Promise<void> = Promise.resolve();
	const tick = async () => {
		await options.call("controller.collect", {});
		await options.call("controller.dispatch", {});
	};
	const schedule = () => {
		if (stopped) return;
		timer = options.clock.setTimer(() => {
			timer = null;
			running = tick()
				.catch((cause: unknown) => {
					options.log("controller tick failed", { error: cause instanceof Error ? cause.message : String(cause) });
				})
				.then(schedule);
		}, 1000);
	};
	return {
		start: async () => {
			if (!stopped) return;
			stopped = false;
			await options.call("controller.recover", {});
			running = tick();
			await running;
			schedule();
		},
		stop: async () => {
			stopped = true;
			if (timer !== null) options.clock.clearTimer(timer);
			timer = null;
			await running;
		},
	};
};
