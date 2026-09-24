import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { attemptCapturePath, attemptStopped } from "./attemptCapture.ts";

let home: string;
const runId = "01M3AD7FMFVM5VXDAWNJAPEZRE";
const terminalId = "b6ff0a1e-5d0b-4e2a-9b52-0f9a1d2c3e44";

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-attempt-capture-test-"));
});

afterAll(async () => {
	await rm(home, { recursive: true, force: true });
});

test("the capture sits under the run and carries the name of the attempt", () => {
	expect(attemptCapturePath(home, runId, terminalId)).toBe(
		join(home, "agents", runId, `output-${terminalId}.txt`),
	);
});

test("an attempt with no capture is not a confirmed stop", async () => {
	expect(await attemptStopped(home, runId, terminalId)).toBe(false);
});

// `stopNative` writes the capture after the execution service reports the
// process as exited. A restart of that service forgets the terminal, and
// this file is what `sessions.start` then reads.
test("an attempt with a capture is a confirmed stop", async () => {
	const capture = attemptCapturePath(home, runId, terminalId);
	await mkdir(dirname(capture), { recursive: true });
	await writeFile(capture, "the agent said goodbye\n");

	expect(await attemptStopped(home, runId, terminalId)).toBe(true);
});
