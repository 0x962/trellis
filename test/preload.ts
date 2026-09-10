import { afterAll } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { changedPaths, guardedPaths, snapshot } from "./homeGuard.ts";
import { createRunRoot, RUN_ROOT_PREFIX, sweepDeadRoots } from "./runRoot.ts";

// Every test process gets one run root in the temp directory, and every home
// of the run sits under it: HOME, the XDG dirs, and TRELLIS_HOME. Code that
// finds a path through the user home then writes into the run root, never
// into the home of the person who runs the tests or into ~/.trellis.
//
// bun test fires no "exit" event after a normal run, so the last afterAll
// hook below removes the root. SIGINT and SIGTERM remove it and exit. A
// SIGKILL leaves the root, and the sweep of the next run removes it.
//
// Bun reads HOME once, when the process starts, so os.homedir() still names
// the real home after HOME changes. The wrapper below makes it read HOME. An
// ESM import of node:os fixes its named exports before the wrapper is set,
// so this file reads node:os through require only.
const os = createRequire(import.meta.url)("node:os") as typeof import("node:os");
sweepDeadRoots(os.tmpdir(), RUN_ROOT_PREFIX);
const root = createRunRoot(os.tmpdir(), RUN_ROOT_PREFIX);
const removeRoot = () => rmSync(root, { recursive: true, force: true });
process.on("exit", removeRoot);
for (const [signal, code] of [
	["SIGINT", 130],
	["SIGTERM", 143],
] as const) {
	// A real signal passes its name to the listener. A test that calls
	// process.emit("SIGTERM") to drive a shutdown in the same process passes
	// nothing, and the run must go on.
	process.on(signal, (name?: string) => {
		if (name === undefined) return;
		removeRoot();
		process.exit(code);
	});
}

const userHome = join(root, "home");
const dirs = {
	TRELLIS_TEST_ROOT: root,
	HOME: userHome,
	XDG_CONFIG_HOME: join(userHome, ".config"),
	XDG_DATA_HOME: join(userHome, ".local", "share"),
	XDG_CACHE_HOME: join(userHome, ".cache"),
	XDG_STATE_HOME: join(userHome, ".local", "state"),
	// The Claude state file the folder trust seeder writes lives in this
	// directory. The real machine points it at a live Claude install, so a
	// test that seeds trust must never read the real value.
	CLAUDE_CONFIG_DIR: join(userHome, ".claude"),
	TRELLIS_HOME: join(root, "trellis"),
};
for (const [key, dir] of Object.entries(dirs)) {
	mkdirSync(dir, { recursive: true });
	process.env[key] = dir;
}
const home = dirs.TRELLIS_HOME;

// This file runs before any test file loads, so a named import of homedir in
// a test file also gets this wrapper.
os.homedir = () => process.env.HOME!;

// The real home comes from the user database and not from HOME, so a nested
// test process guards the real home too. TRELLIS_TEST_GUARD_HOME moves the
// guard to a temp directory, which test/home-guard.test.ts uses to prove it.
const guarded = guardedPaths(process.env.TRELLIS_TEST_GUARD_HOME ?? os.userInfo().homedir);
const before = snapshot(guarded);

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
	const failures: string[] = [];
	if (existsSync(marker)) failures.push(`a test spawned launchctl: ${readFileSync(marker, "utf8").trim()}`);
	const changed = changedPaths(before, snapshot(guarded));
	if (changed.length > 0) failures.push(`a test wrote under the real home: ${changed.join(", ")}`);
	removeRoot();
	if (failures.length === 0) return;
	for (const failure of failures) process.stderr.write(`error: ${failure}\n`);
	process.exit(1);
});
