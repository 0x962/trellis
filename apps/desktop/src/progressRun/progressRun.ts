const phases = [
	{ id: "prepareRestart", label: "Prepare restart", estimate: 10000 },
	{ id: "restartHost", label: "Restart background host", estimate: 5000 },
	{ id: "relaunch", label: "Relaunch desktop", estimate: 1500 },
	{ id: "prepareApp", label: "Prepare app", estimate: 3000 },
	{ id: "restoreServices", label: "Restore local services", estimate: 10000 },
	{ id: "openApp", label: "Open Trellis", estimate: 1000 },
] as const;

export type ProgressState = {
	mode: "startup" | "restart";
	index: number;
	phaseStartedAt: number;
	stage: string;
	history: Record<string, number>;
	completed: boolean;
};

export const progressRun = (
	input: { mode: ProgressState["mode"]; now: number; history?: Record<string, number> } | { checkpoint: ProgressState },
) => {
	const state: ProgressState =
		"checkpoint" in input
			? input.checkpoint
			: {
					mode: input.mode,
					index: input.mode === "restart" ? 0 : 3,
					phaseStartedAt: input.now,
					stage: input.mode === "restart" ? "Prepare restart" : "Prepare Trellis",
					history: { ...input.history },
					completed: false,
				};
	const recordPhase = (now: number) => {
		const key = phases[state.index]!.id;
		const duration = Math.max(100, now - state.phaseStartedAt);
		state.history[key] = state.history[key] === undefined ? duration : (state.history[key]! + duration) / 2;
	};
	return {
		state,
		report: (stage: string, now: number) => {
			let next: number;
			if (stage === "Open Trellis") next = 5;
			else if (stage === "Relaunch desktop") next = 2;
			else if (stage === "Prepare Trellis") next = 3;
			else if (state.index < 3)
				next = ["Stop background host", "Start background host", "Wait for background host"].includes(stage) ? 1 : 0;
			else next = ["Check installed app", "Check host compatibility"].includes(stage) ? 3 : 4;
			if (next > state.index) {
				recordPhase(now);
				state.index = next;
				state.phaseStartedAt = now;
			}
			state.stage = stage;
		},
		complete: (now: number) => {
			recordPhase(now);
			state.completed = true;
		},
		view: (now: number) => {
			const start = state.mode === "restart" ? 0 : 3;
			const total = phases.length - start;
			const current = phases[state.index]!;
			const estimate = state.history[current.id] ?? current.estimate;
			const spent = now - state.phaseStartedAt;
			const future = phases
				.slice(state.index + 1)
				.reduce((sum, phase) => sum + (state.history[phase.id] ?? phase.estimate), 0);
			return {
				updatedAt: now,
				estimateExpiresAt: state.phaseStartedAt + estimate * 1.25,
				phase: current.label,
				stage: state.stage,
				step: state.index - start + 1,
				total,
				progress: state.completed ? 1 : (state.index - start) / total,
				remainingMs: state.completed ? 0 : spent > estimate * 1.25 ? null : Math.max(1000, estimate - spent + future),
			};
		},
	};
};
