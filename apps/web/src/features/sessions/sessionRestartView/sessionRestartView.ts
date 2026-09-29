import type { AgentRun } from "@trellis/api";

export type SessionRestart = {
	id: number;
	status: "idle" | "pending" | "success" | "error";
	previousTerminalId: string | null;
	result: AgentRun | undefined;
};

export type SessionRestartView = {
	run: AgentRun;
	restartId: number | undefined;
	pending: boolean;
	busy: boolean;
};

export function sessionRestartView(
	run: AgentRun,
	restart: SessionRestart | undefined,
	previous?: SessionRestartView,
): SessionRestartView {
	let current = run;
	if (restart && run.terminalId === restart.previousTerminalId) {
		// A query can finish with the old attempt after the replacement reaches this view.
		if (
			previous?.run.id === run.id &&
			previous.restartId === restart.id &&
			previous.run.terminalId !== restart.previousTerminalId
		)
			current = previous.run;
		const result = restart.result;
		if (
			result &&
			(current === run ||
				result.updatedAt > current.updatedAt ||
				(result.updatedAt === current.updatedAt &&
					(result.observation?.checkedAt ?? "") > (current.observation?.checkedAt ?? "")))
		)
			current = result;
	}
	const pending =
		current.state === "starting" ||
		(restart?.status === "pending" && current.terminalId === restart.previousTerminalId);
	return {
		run: current,
		restartId: restart?.id,
		pending,
		busy: pending || restart?.status === "pending",
	};
}
