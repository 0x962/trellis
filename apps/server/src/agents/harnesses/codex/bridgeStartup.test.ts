import { afterEach, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeRuntimeSocket, scratchHome, spawnBridge, writeExecutable } from "../bridgeTestFixtures/index.ts";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(program: string) {
	const home = await scratchHome(cleanups);
	const runtime = await fakeRuntimeSocket(home, cleanups, () => ({}), "refused");
	const executable = await writeExecutable(join(home, "codex"), `#!/usr/bin/env node\n${program}`);
	const directory = join(home, "engine");
	const bridge = spawnBridge({
		entry: fileURLToPath(new URL("./bridgeEntry.ts", import.meta.url)),
		env: {
			TRELLIS_CODEX_EXECUTABLE: executable,
			TRELLIS_CODEX_ENGINE_SOCKET: join(directory, "engine.sock"),
			TRELLIS_CODEX_CONTROL_SOCKET: join(directory, "control.sock"),
			TRELLIS_CODEX_CONTROL_TOKEN: "control-token",
			TRELLIS_HARNESS_SOCKET: runtime.path,
			TRELLIS_ATTEMPT_ID: "attempt-1",
			TRELLIS_ATTEMPT_TOKEN: "attempt-token",
		},
		launch: { cwd: home, prompt: "work" },
	});
	const finished = bridge.finish();
	cleanups.push(async () => {
		if (bridge.child.exitCode === null) bridge.child.kill("SIGTERM");
		await finished;
	});
	return { home, directory, runtime, bridge, finished };
}

test("an engine exit before socket readiness preserves its reason and closes the wait", async () => {
	const state = await fixture("process.exit(7);\n");
	const result = await state.finished;
	expect(result.exitCode).toBe(1);
	expect(state.runtime.observed).toHaveLength(1);
	expect(state.runtime.observed[0]).toMatchObject({ kind: "error", error: "Codex engine exited: 7" });
	expect(await Bun.file(join(state.home, "codex-engine.log")).text()).toBe("");
	expect(await Bun.file(join(state.directory, "engine.sock")).exists()).toBe(false);
	await expect(stat(state.directory)).rejects.toMatchObject({ code: "ENOENT" });
}, 5_000);

test("stop before socket readiness removes the child and socket directory promptly", async () => {
	const state = await fixture(`
const { writeFileSync } = require("node:fs");
writeFileSync("engine.pid", String(process.pid));
setInterval(() => {}, 1000);
`);
	const pidPath = join(state.home, "engine.pid");
	while (!(await Bun.file(pidPath).exists())) await Bun.sleep(10);
	const pid = Number(await readFile(pidPath, "utf8"));
	state.bridge.child.kill("SIGTERM");
	const result = await state.finished;
	expect(result.exitCode).toBe(1);
	expect(state.runtime.observed).toEqual([{ kind: "idle", outcome: "interrupted" }]);
	expect(() => process.kill(pid, 0)).toThrow("ESRCH");
	await expect(stat(state.directory)).rejects.toMatchObject({ code: "ENOENT" });
}, 5_000);
