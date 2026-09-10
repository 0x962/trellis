import { afterAll } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every test run gets its own empty data home. A test that writes under
// TRELLIS_HOME never touches ~/.trellis, and two runs never share a file.
const home = mkdtempSync(join(tmpdir(), "trellis-test-"));
process.env.TRELLIS_HOME = home;
process.on("exit", () => rmSync(home, { recursive: true }));

// A fake launchctl comes first on PATH in the test process and in every
// process a test spawns. A real launchctl call loads a server agent that
// opens the person's own data home next to their live server and corrupts
// it. The fake loads nothing: it appends the call to the marker file and
// exits 1. After the last test, a marker file fails the run and names the
// call.
const bin = join(home, "bin");
mkdirSync(bin);
const fake = join(bin, "launchctl");
writeFileSync(fake, '#!/bin/sh\necho "launchctl $*" >> "$TRELLIS_LAUNCHCTL_MARKER"\nexit 1\n');
chmodSync(fake, 0o755);
const marker = join(home, "launchctl-calls");
process.env.TRELLIS_LAUNCHCTL_MARKER = marker;
process.env.PATH = `${bin}:${process.env.PATH}`;

// Bun.spawn and Bun.spawnSync without an `env` option look up the program
// and build the child environment from the environment the process started
// with, which has neither the PATH nor the marker above. These wrappers pass
// process.env to such a call, so it also reaches the fake launchctl.
type Spawn = (...args: unknown[]) => unknown;
const withEnv = (args: unknown[]) =>
	Array.isArray(args[0])
		? [args[0], { env: process.env, ...(args[1] as object | undefined) }]
		: [{ env: process.env, ...(args[0] as object) }];
const spawn = Bun.spawn as Spawn;
const spawnSync = Bun.spawnSync as Spawn;
Object.assign(Bun, {
	spawn: (...args: unknown[]) => spawn(...withEnv(args)),
	spawnSync: (...args: unknown[]) => spawnSync(...withEnv(args)),
});

// node:child_process has the same gap. This file runs before any test file
// loads, so a named import of these functions also gets the wrappers. Each
// wrapper adds process.env to the options of a call, or adds an options
// object when the call passes none. exec and execSync take the options
// second. The others take them third when the second argument is an
// argument array, and second when it is not.
const childProcess = createRequire(import.meta.url)("node:child_process") as Record<string, Spawn>;
const optionsIndex = (name: string, args: unknown[]) =>
	name === "exec" || name === "execSync" ? 1 : Array.isArray(args[1]) ? 2 : 1;
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
	const original = childProcess[name]!;
	const wrapper = (...args: unknown[]) => {
		const at = optionsIndex(name, args);
		const given = args[at];
		const next = [...args];
		if (given !== null && typeof given === "object") next[at] = { env: process.env, ...given };
		else next.splice(at, 0, { env: process.env });
		return original(...next);
	};
	// util.promisify reads a custom symbol on exec and execFile, so the
	// wrapper carries every property of the original.
	Object.defineProperties(wrapper, Object.getOwnPropertyDescriptors(original));
	childProcess[name] = wrapper;
}

// bun test prints an error thrown in this hook and still exits 0, so the
// hook sets the exit code itself.
afterAll(() => {
	if (!existsSync(marker)) return;
	process.stderr.write(`error: a test spawned launchctl: ${readFileSync(marker, "utf8").trim()}\n`);
	process.exit(1);
});
