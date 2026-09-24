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

// AGENTS.md tells an agent to put a scratch checkout or a temporary
// directory under $TMPDIR with this prefix in the name, and to remove it
// when the work ends.
export const SCRATCH_PREFIX = "trellis-";

const finishedCategories = new Set(["done", "canceled"]);

const inside = (path: string, directory: string) => path === directory || path.startsWith(directory + sep);

// Whether the worktree at `directory` (`<home>/agents/<run id>/work`) may go.
//
// A run refers to its worktree through `workspace_id`. A restart gives the
// same worktree to a run with a new id, so the run named by the directory
// alone proves nothing about who works there. An assigned agent on a finished
// ticket must have a confirmed process exit before its worktree can go.
// A person owns a session workspace and deletes it through the session.
export const workspaceRemovable = (
	directory: string,
	runs: SweepRun[],
	running: RunningProcess[],
	stopped: ReadonlySet<string> = new Set(),
	heldPaths: readonly string[] = [],
) => {
	const runId = basename(dirname(directory));
	const owners = runs.filter((run) => run.workspaceId === directory || run.id === runId);
	if (
		owners.some(
			(run) =>
				run.kind === "session" ||
				!finishedCategories.has(run.ticketCategory ?? "") ||
				(run.open && (run.terminalId === null || !stopped.has(run.terminalId))),
		)
	)
		return false;
	if (heldPaths.some((path) => inside(path, directory))) return false;
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

// The names of the scratch directories that a process on this computer
// holds open. `openPaths` holds every path that a process has open, and
// `roots` holds the spellings of the temporary directory that hold those
// scratch directories. A path such as
// `<root>/trellis-trl404-K4fb/repo/node_modules/x` names `trellis-trl404-K4fb`.
//
// macOS calls the temporary directory of a person `/var/folders/<id>/T`,
// and `/var` is a symbolic link to `/private/var`. lsof prints a file under
// `/private/var` and a socket under `/var`, so both spellings reach here
// and one name can arrive through either.
export const heldScratchNames = (openPaths: string[], roots: string[]) => {
	const names = new Set<string>();
	for (const path of openPaths) {
		for (const root of roots) {
			if (!path.startsWith(root + sep)) continue;
			const name = path.slice(root.length + 1).split(sep)[0] ?? "";
			if (name.startsWith(SCRATCH_PREFIX)) names.add(name);
		}
	}
	return names;
};
