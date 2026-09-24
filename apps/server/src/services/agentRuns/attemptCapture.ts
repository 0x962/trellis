import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// The file that holds the terminal output of one attempt of a run.
export const attemptCapturePath = (home: string, runId: string, terminalId: string) =>
	join(home, "agents", runId, `output-${terminalId}.txt`);

// True while trellis holds the output of this attempt. Every writer below
// writes the file only after the execution service reports the process as
// exited, so the file records a confirmed exit.
//
// The execution service keeps the record of an exited terminal in memory and
// forgets it when it starts again. A run that keeps its assignment after its
// process ends then names an attempt that the service cannot answer for, and
// without this file a caller cannot tell that attempt from a launch whose
// outcome nobody knows.
export const attemptStopped = (home: string, runId: string, terminalId: string) =>
	Bun.file(attemptCapturePath(home, runId, terminalId)).exists();

export const writeAttemptCapture = async (home: string, runId: string, terminalId: string, output: string) => {
	const capture = attemptCapturePath(home, runId, terminalId);
	await mkdir(dirname(capture), { recursive: true, mode: 0o700 });
	await writeFile(capture, output, { mode: 0o600 });
};

// Records the exit of an attempt that ended on its own, which no stop wrote
// a file for. The two reconciliation paths call this the first time the
// execution service reports the process as exited, so the record exists
// before that service forgets it.
//
// The read of the output crosses to the execution service, and that service
// can drop the terminal between the report and this read. A terminal that
// answers no output stays unrecorded, and the next reconciliation reads it
// again. A caller that finds no record refuses its action, which is the safe
// answer for an outcome nobody confirmed.
export const recordAttemptExit = async (
	home: string,
	runId: string,
	terminalId: string,
	readOutput: (home: string, terminalId: string) => Promise<string>,
) => {
	if (await attemptStopped(home, runId, terminalId)) return;
	const output = await readOutput(home, terminalId).catch(() => null);
	if (output === null) return;
	await writeAttemptCapture(home, runId, terminalId, output);
};
