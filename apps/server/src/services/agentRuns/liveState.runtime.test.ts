import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { nativeClient } from "../../agents/native/connection.ts";
import { readRuntimeSessions, readRuntimeSessionsRequired } from "./liveState.ts";

let home: string;
const previousScript = process.env.TRELLIS_RUNTIME_SCRIPT;

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-runtime-list-"));
	await symlink(resolve(import.meta.dir, "../../../../../node_modules"), join(home, "node_modules"));
	const build = await Bun.build({
		entrypoints: [resolve(import.meta.dir, "../../../../runtime/src/index.ts")],
		outdir: home,
		target: "node",
		external: ["fs-ext", "node-pty", "koffi"],
	});
	expect(build.success).toBe(true);
	process.env.TRELLIS_RUNTIME_SCRIPT = join(home, "index.js");
});

afterAll(async () => {
	if (previousScript === undefined) delete process.env.TRELLIS_RUNTIME_SCRIPT;
	else process.env.TRELLIS_RUNTIME_SCRIPT = previousScript;
	if (existsSync(join(home, "runtime/runtime.sock"))) {
		await nativeClient(home).shutdown();
		const deadline = Date.now() + 5000;
		while (existsSync(join(home, "runtime/manifest.json")) && Date.now() < deadline) await Bun.sleep(25);
		expect(existsSync(join(home, "runtime/manifest.json"))).toBe(false);
	}
	await rm(home, { recursive: true, force: true });
});

test("a required list starts an absent runtime and reuses it on the next read", async () => {
	expect(await readRuntimeSessions(home, { ids: ["saved-attempt"] })).toEqual([]);
	expect(existsSync(join(home, "runtime/runtime.sock"))).toBe(false);
	expect(await readRuntimeSessionsRequired(home, { ids: ["saved-attempt"] })).toEqual([]);
	const first = await nativeClient(home).hello();
	expect(await readRuntimeSessionsRequired(home, { ids: ["saved-attempt"] })).toEqual([]);
	expect((await nativeClient(home).hello()).daemonId).toBe(first.daemonId);
}, 15_000);
