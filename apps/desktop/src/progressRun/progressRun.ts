const phases = [
	{ id: "prepareApp", label: "Prepare app", estimate: 3000 },
	{ id: "restoreServices", label: "Restore local services", estimate: 10000 },
	{ id: "openApp", label: "Open Trellis", estimate: 1000 },
] as const;

export type ProgressState = {
	index: number;
	phaseStartedAt: number;
	stage: string;
	history: Record<string, number>;
	completed: boolean;
};

export const progressRun = (input: { now: number; history?: Record<string, number> }) => {
	const state: ProgressState = {
		index: 0,
		phaseStartedAt: input.now,
		stage: "Prepare Trellis",
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
			if (stage === "Open Trellis") next = 2;
			else next = ["Prepare Trellis", "Check installed app", "Check host compatibility"].includes(stage) ? 0 : 1;
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
			const total = phases.length;
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
				step: state.index + 1,
				total,
				progress: state.completed ? 1 : state.index / total,
				remainingMs: state.completed ? 0 : spent > estimate * 1.25 ? null : Math.max(1000, estimate - spent + future),
			};
		},
	};
};
