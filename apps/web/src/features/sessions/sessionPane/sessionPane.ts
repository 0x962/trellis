import { type AgentRun, hasAssignedProcess } from "@trellis/api";

// The block that the conversation pane draws under its header.
export type SessionPane =
	| { kind: "terminal" }
	// The process ended before the agent finished its work. `detail` holds
	// the line that the execution service recorded, such as the path of the
	// binary and the exit code it returned.
	| { kind: "failed"; title: string; description: string; detail: string | null }
	// The process ended, and nothing went wrong. A person pressed Stop, or
	// the agent finished and the process closed.
	| { kind: "stopped"; title: string; description: string };

// A terminal draws the output of a live process. A process that ended
// takes its buffer with it, so the pane says why the process is gone and
// offers the control that starts a new one. A run that another runtime
// owns keeps its own view, because trellis starts no process for it.
export function sessionPane(run: AgentRun): SessionPane {
	if (run.runtime !== "native" || run.state === "starting" || hasAssignedProcess(run)) return { kind: "terminal" };
	if (run.state === "failed" || run.error !== null)
		return {
			kind: "failed",
			title: "The agent stopped before it finished",
			description:
				"Trellis keeps the workspace and every file in it. A new start opens a new agent in the same workspace.",
			detail: run.error,
		};
	return {
		kind: "stopped",
		title: "The agent is not running",
		description: "Trellis keeps the workspace and every file in it. Start the agent to open its terminal again.",
	};
}

// True while trellis can open a process for this run. A session carries
// its own start. A ticket agent resumes the terminal it already holds, so
// it needs a terminal id.
export const canStartAgent = (run: AgentRun, hasSession: boolean) =>
	run.runtime === "native" && run.state !== "starting" && (hasSession || run.terminalId !== null);
