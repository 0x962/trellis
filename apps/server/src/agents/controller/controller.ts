import type { LoopStatus } from "@trellis/api";
import type { JobsClock, JobsLog } from "../../jobs.ts";

export type ControllerOptions = {
	call: (name: "controller.dispatch", input: { manage: boolean }) => Promise<unknown>;
	clock: JobsClock;
	log: JobsLog;
};

export const createController = (options: ControllerOptions) => {
	let timer: number | null = null;
	let stopped = true;
	let running: Promise<void> | null = null;
	let requested = false;
	let sequence = 0;
	const state: LoopStatus = {
		id: "deterministic-manager",
		name: "Deterministic manager",
		description:
			"Keeps a worker on each ticket in an automated column and a copilot available for each active project. Restarts failed or inactive workers with the current column settings.",
		paused: false,
		working: false,
		step: "Not started",
		runCount: 0,
		lastStartedAt: null,
		lastFinishedAt: null,
		nextRunAt: null,
		lastError: null,
		output: [],
		errors: [],
	};
	const record = (message: string, level: "info" | "error" = "info") => {
		const entry = { id: ++sequence, at: options.clock.now().toISOString(), message, level };
		state.output = [...state.output.slice(-199), entry];
		if (level === "error") state.errors = [...state.errors.slice(-19), entry];
	};
	const cancelTimer = () => {
		if (timer !== null) options.clock.clearTimer(timer);
		timer = null;
		state.nextRunAt = null;
	};
	const schedule = (delay = 1000) => {
		if (stopped) return;
		state.nextRunAt = state.paused ? null : new Date(options.clock.now().getTime() + delay).toISOString();
		timer = options.clock.setTimer(() => {
			timer = null;
			tick();
		}, delay);
	};
	const tick = () => {
		if (running) return;
		cancelTimer();
		const manage = !state.paused || requested;
		requested = false;
		if (manage) {
			state.working = true;
			state.step = "Read runtime";
			state.lastStartedAt = options.clock.now().toISOString();
			state.runCount++;
		}
		running = options
			.call("controller.dispatch", { manage })
			.then(() => {
				if (manage) {
					state.lastError = null;
					state.step = "Complete";
				}
			})
			.catch((cause: unknown) => {
				const error = cause instanceof Error ? cause.message : String(cause);
				options.log("controller tick failed", { error });
				if (manage) {
					state.lastError = error;
					record(`${state.step}: ${error}`, "error");
				}
			})
			.finally(() => {
				if (manage) {
					state.working = false;
					state.lastFinishedAt = options.clock.now().toISOString();
				}
				running = null;
				schedule(requested ? 0 : 1000);
			});
	};
	return {
		read: (): LoopStatus => structuredClone(state),
		record,
		report: (step: string, message?: string) => {
			if (!state.working) return;
			state.step = step;
			if (message) record(message);
		},
		pause: () => {
			state.paused = true;
			state.nextRunAt = null;
			requested = false;
			record("Automatic management paused. Current work can finish.");
		},
		resume: () => {
			state.paused = false;
			record("Automatic management resumed.");
			if (!running) tick();
		},
		runNow: () => {
			if (state.working) return;
			requested = true;
			if (!running) tick();
		},
		clear: () => {
			state.output = [];
			state.errors = [];
		},
		start: async () => {
			if (!stopped) return;
			stopped = false;
			schedule(0);
		},
		stop: async () => {
			stopped = true;
			requested = false;
			cancelTimer();
			await running;
		},
	};
};
