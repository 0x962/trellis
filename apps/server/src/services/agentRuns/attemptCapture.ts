import { join } from "node:path";

// The file that holds the terminal output of one attempt of a run.
export const attemptCapturePath = (home: string, runId: string, terminalId: string) =>
	join(home, "agents", runId, `output-${terminalId}.txt`);

// True while trellis holds the output of this attempt. `stopNative` writes
// that file only after the execution service reports the process as exited,
// so the file records a confirmed exit.
//
// The execution service keeps the record of an exited terminal in memory
// and forgets it when it starts again. A run that a pause left open then
// names an attempt that the execution service cannot answer for, and
// without this file a caller cannot tell that attempt from a launch whose
// outcome nobody knows.
export const attemptStopped = (home: string, runId: string, terminalId: string) =>
	Bun.file(attemptCapturePath(home, runId, terminalId)).exists();
