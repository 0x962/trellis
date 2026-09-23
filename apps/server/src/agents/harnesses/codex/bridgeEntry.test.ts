import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeRuntimeSocket, scratchHome, spawnBridge, writeExecutable } from "../bridgeTestSupport/index.ts";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const pathFromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

test("the Codex bridge records why it stopped when its engine gives no app server", async () => {
	const home = await scratchHome(cleanups);
	const runtime = await fakeRuntimeSocket(home, cleanups, () => ({}), "refused");
	const engine = join(home, "codex-engine");
	// The stand-in writes a plain file where the app server socket belongs, so
	// the bridge finds the path and then fails to speak to it.
	const executable = await writeExecutable(
		join(home, "codex"),
		'#!/bin/sh\n: > "$TRELLIS_CODEX_ENGINE_SOCKET"\nsleep 30\n',
	);
	const bridge = spawnBridge({
		entry: pathFromHere("./bridgeEntry.ts"),
		env: {
			TRELLIS_CODEX_EXECUTABLE: executable,
			TRELLIS_CODEX_ENGINE_SOCKET: join(engine, "engine.sock"),
			TRELLIS_CODEX_CONTROL_SOCKET: join(home, "codex-control", "control.sock"),
			TRELLIS_CODEX_CONTROL_TOKEN: "control-token",
			TRELLIS_HARNESS_SOCKET: runtime.path,
			TRELLIS_ATTEMPT_ID: "attempt-1",
			TRELLIS_ATTEMPT_TOKEN: "attempt-token",
		},
		launch: { cwd: home, prompt: "do the work" },
	});
	const run = await bridge.finish();
	expect(runtime.observed).toHaveLength(1);
	expect(runtime.observed[0]).toMatchObject({ kind: "error", outcome: "failed" });
	// The socket library writes this text, and its wording can change. The
	// test reads one keyword and not the full text.
	expect(runtime.observed[0]!.error).toMatch(/WebSocket|ENOTSOCK|connect/);
	expect(run.exitCode).toBe(1);
});
