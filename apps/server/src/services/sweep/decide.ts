import { basename, dirname, sep } from "node:path";

// The facts of one row of `agent_runs` that the sweep reads.
export type SweepRun = {
	id: string;
	kind: string;
	runtime: string;
	workspaceId: string | null;
	terminalId: string | null;
	// True while `closed_at` is null.
	open: boolean;
	// The status category of the ticket of the run. Null when the run has no
	// ticket, or the ticket is gone.
	ticketCategory: string | null;
};

// A process the runtime reports as running, with the directory it runs in.
export type RunningProcess = { id: string; cwd: string | null };

// An attempt directory under `<home>/harness-attempts`, named by the
// terminal id of the attempt.
export type AttemptDirectory = { id: string; modifiedAt: number };

const finishedCategories = new Set(["done", "canceled"]);

const inside = (path: string, directory: string) => path === directory || path.startsWith(directory + sep);

// Whether the worktree at `directory` (`<home>/agents/<run id>/work`) may go.
//
// A run refers to its worktree through `workspace_id`. A restart gives the
// same worktree to a run with a new id, so the run named by the directory
// alone proves nothing about who works there. The worktree stays while any
// run that refers to it is open, works a ticket that is not done or
// canceled, or is a scratch session (a person deletes those through the
// session), and while a process the runtime reports as running belongs to
// one of those runs or has its working directory inside the worktree.
export const workspaceRemovable = (directory: string, runs: SweepRun[], running: RunningProcess[]) => {
	const runId = basename(dirname(directory));
	const owners = runs.filter((run) => run.workspaceId === directory || run.id === runId);
	if (owners.some((run) => run.kind === "session" || run.open || !finishedCategories.has(run.ticketCategory ?? "")))
		return false;
	const terminals = new Set(owners.map((run) => run.terminalId));
	return !running.some(
		(process) => terminals.has(process.id) || (process.cwd !== null && inside(process.cwd, directory)),
	);
};

const terminalOutputFile = /^output-(.+)\.txt$/;

// The files in `<home>/agents/<run id>` that no reader opens again. A stop
// writes the whole terminal output to `output-<terminal id>.txt`, and the
// output route reads the file of the current terminal of the run only.
// `output.txt` is read for a run outside the native runtime only. When the
// run row is gone, every output file may go.
export const outputFilesToRemove = (names: string[], run: SweepRun | undefined) =>
	names.filter((name) => {
		if (name === "output.txt") return run === undefined || run.runtime === "native";
		const match = terminalOutputFile.exec(name);
		return match !== null && match[1] !== run?.terminalId;
	});

// The attempt directories that may go: no run names the attempt as its
// current terminal, and the directory is older than `minAgeMs`. A launch
// writes its terminal id to the run after it creates the directory, so a
// young directory stays.
export const attemptsToRemove = (
	attempts: AttemptDirectory[],
	currentTerminals: Set<string>,
	now: number,
	minAgeMs: number,
) =>
	attempts
		.filter((attempt) => !currentTerminals.has(attempt.id) && now - attempt.modifiedAt >= minAgeMs)
		.map((attempt) => attempt.id);
