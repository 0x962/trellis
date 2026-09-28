import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// The file that holds the terminal output of one attempt of a run.
export const attemptCapturePath = (home: string, runId: string, terminalId: string) =>
	join(home, "agents", runId, `output-${terminalId}.txt`);

// A capture proves that the runtime confirmed this attempt exited.
export const attemptStopped = (home: string, runId: string, terminalId: string) =>
	Bun.file(attemptCapturePath(home, runId, terminalId)).exists();

export const writeAttemptCapture = async (home: string, runId: string, terminalId: string, output: string) => {
	const capture = attemptCapturePath(home, runId, terminalId);
	await mkdir(dirname(capture), { recursive: true, mode: 0o700 });
	await writeFile(capture, output, { mode: 0o600 });
};

// The runtime can expire output before the host copies it. Process recovery
// checks an attempt independently when this output is unavailable.
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
