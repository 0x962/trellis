import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	fakeRuntimeSocket,
	type RuntimeAnswer,
	scratchHome,
	spawnBridge,
	writeExecutable,
} from "../bridgeTestFixtures/index.ts";
import type { HarnessEvent } from "../types.ts";

// A bridge that stops must say why, and it must exit. These tests run the real
// Muse bridge against a runtime socket that the test controls.
const TIMEOUT_MESSAGE = "Runtime observe response is unknown: request timed out";
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const pathFromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Returns true when `observed` holds an event of that kind, and false after 15
// seconds. A test waits here, then acts while the bridge still waits for the
// reply to that write.
async function waitForEvent(observed: HarnessEvent[], kind: string) {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		if (observed.some((event) => event.kind === kind)) return true;
		await Bun.sleep(25);
	}
	return false;
}

async function startMuseBridge(
	answerFor: (event: HarnessEvent) => RuntimeAnswer,
	options: { withTerminal?: boolean; exitAfterPrompt?: boolean } = {},
) {
	const home = await scratchHome(cleanups);
	const runtime = await fakeRuntimeSocket(home, cleanups, answerFor, TIMEOUT_MESSAGE);
	const executable = await writeExecutable(
		join(home, "muse"),
		`#!/bin/sh\nexec "${process.execPath}" "${pathFromHere("./museHostFixture.ts")}" "$@"\n`,
	);
	const bridge = spawnBridge({
		entry: pathFromHere("./bridgeEntry.ts"),
		env: {
			TRELLIS_MUSE_EXECUTABLE: executable,
			TRELLIS_MUSE_CONTROL_SOCKET: join(home, "muse-control", "control.sock"),
			TRELLIS_MUSE_CONTROL_TOKEN: "control-token",
			TRELLIS_HARNESS_SOCKET: runtime.path,
			TRELLIS_ATTEMPT_ID: "attempt-1",
			TRELLIS_ATTEMPT_TOKEN: "attempt-token",
			TRELLIS_TEST_MUSE_HOME: home,
			...(options.exitAfterPrompt === true ? { TRELLIS_TEST_EXIT_AFTER_PROMPT: "1" } : {}),
		},
		launch: { cwd: home, prompt: "do the work" },
		withTerminal: options.withTerminal,
	});
	return { ...bridge, observed: runtime.observed };
}

const refuseMessages = (event: HarnessEvent): RuntimeAnswer => ({ refuse: event.kind === "message" });

test("the Muse bridge records why it stopped after its event chain rejects", async () => {
	const bridge = await startMuseBridge(refuseMessages);
	const run = await bridge.finish();
	expect(bridge.observed.map((event) => event.kind)).toEqual(["session", "prompt", "message", "error"]);
	expect(bridge.observed.at(-1)).toMatchObject({ kind: "error", outcome: "failed", error: TIMEOUT_MESSAGE });
	expect(run.exitCode).toBe(1);
});

test("the Muse bridge prints why it stopped when the runtime refuses that record too", async () => {
	const bridge = await startMuseBridge((event) => ({ refuse: event.kind === "message" || event.kind === "error" }));
	const run = await bridge.finish();
	expect(run.stderr).toContain(`The bridge stopped: ${TIMEOUT_MESSAGE}`);
	expect(run.stderr).toContain(`The bridge could not record that reason: ${TIMEOUT_MESSAGE}`);
	expect(run.exitCode).toBe(1);
});

// The bridge waits up to 5000 ms for the Muse host to exit, so the default
// test limit of 5000 ms is too short. A bridge that keeps its terminal reader
// never exits, and the test then fails at the limit below.
test("the Muse bridge stops its terminal reader and exits", async () => {
	const bridge = await startMuseBridge(refuseMessages, { withTerminal: true });
	const run = await bridge.finish();
	expect(bridge.observed.at(-1)).toMatchObject({ kind: "error", outcome: "failed" });
	expect(run.exitCode).toBe(1);
}, 20000);

// The Muse host stops here while the write of the prompt event is in flight.
// The bridge then fails for a reason that `start()` in `bridgeEntry.ts` does
// not see, and the event chain of the bridge holds no rejection.
test("the Muse bridge records a failure that its start step does not see", async () => {
	const bridge = await startMuseBridge((event) => ({ delayMs: event.kind === "prompt" ? 300 : undefined }), {
		withTerminal: true,
		exitAfterPrompt: true,
	});
	const run = await bridge.finish();
	expect(bridge.observed.at(-1)).toMatchObject({
		kind: "error",
		outcome: "failed",
		error: "Muse session host exited: 0",
	});
	expect(run.exitCode).toBe(1);
}, 20000);

// The failure path stops the terminal reader, and the terminal then makes
// SIGINT from a Ctrl+C. Node stops a process with no listener for that signal,
// and the runtime write below takes 500 ms, so the reason would be lost.
test("a Ctrl+C while the Muse bridge records a failure does not stop it", async () => {
	// This bridge runs without a terminal, because `script` takes a signal for
	// itself and passes none to the bridge.
	const bridge = await startMuseBridge((event) => ({
		refuse: event.kind === "message",
		delayMs: event.kind === "error" ? 500 : undefined,
	}));
	expect(await waitForEvent(bridge.observed, "error")).toBe(true);
	bridge.child.kill("SIGINT");
	const run = await bridge.finish();
	expect(bridge.observed.at(-1)).toMatchObject({ kind: "error", outcome: "failed", error: TIMEOUT_MESSAGE });
	expect(run.stderr).toContain("The bridge received Ctrl+C.");
	expect(run.exitCode).toBe(1);
}, 20000);
