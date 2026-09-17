import type { LoopStatus, LoopStepId } from "@trellis/api";
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
		step: "Wait",
		steps: [
			{
				id: "wait",
				title: "Wait",
				description: "Wait one second before the next pass, or until you resume the loop.",
				active: true,
				detail: "",
			},
			{
				id: "runtime",
				title: "Read runtime",
				description: "Read the current agent processes and their activity.",
				active: false,
				detail: "",
			},
			{
				id: "workers",
				title: "Check workers and copilots",
				description: "Read assignments. Start or recover agents with the current project and column settings.",
				active: false,
				detail: "",
			},
			{
				id: "messages",
				title: "Deliver messages",
				description: "Deliver chat messages and direct mentions to agents.",
				active: false,
				detail: "",
			},
		],
		runCount: 0,
		lastStartedAt: null,
		lastFinishedAt: null,
		nextRunAt: null,
		lastError: null,
		output: [],
		errors: [],
	};
	const record = (message: string, level: "info" | "error" = "info", stepId: LoopStepId = "workers") => {
		const entry = { id: ++sequence, at: options.clock.now().toISOString(), message, level, stepId };
		state.output = [...state.output.slice(-199), entry];
		if (level === "error") state.errors = [...state.errors.slice(-19), entry];
	};
	const runStep = async <T>(id: LoopStepId, work: () => Promise<T>): Promise<T> => {
		const step = state.steps.find((item) => item.id === id)!;
		state.steps[0]!.active = false;
		step.active = true;
		step.detail = "";
		const before = sequence;
		return work()
			.catch((cause: unknown) => {
				if (!state.errors.some((entry) => entry.id > before && entry.stepId === id))
					record(cause instanceof Error ? cause.message : String(cause), "error", id);
				throw cause;
			})
			.finally(() => {
				step.active = false;
			});
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
		const before = sequence;
		const manage = !state.paused || requested;
		requested = false;
		if (manage) {
			state.working = true;
			state.step = "Read runtime";
			for (const step of state.steps) {
				step.active = step.id === "runtime";
				step.detail = "";
			}
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
					if (!state.errors.some((entry) => entry.id > before)) record(error, "error", "runtime");
				}
			})
			.finally(() => {
				if (manage) {
					state.working = false;
					state.lastFinishedAt = options.clock.now().toISOString();
					state.step = "Wait";
					for (const step of state.steps) step.active = step.id === "wait";
				}
				running = null;
				schedule(requested ? 0 : 1000);
			});
	};
	return {
		read: (): LoopStatus => structuredClone(state),
		record,
		runStep,
		report: (step: string, message?: string) => {
			if (!state.working) return;
			state.step = step;
			state.steps.find((item) => item.id === "workers")!.detail = step;
			if (message) record(message);
		},
		pause: () => {
			state.paused = true;
			state.nextRunAt = null;
			requested = false;
			record("Automatic management paused. Current work can finish.", "info", "wait");
		},
		resume: () => {
			state.paused = false;
			record("Automatic management resumed.", "info", "wait");
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
