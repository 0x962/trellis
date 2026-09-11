import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StubState } from "../../server/test/stubs/superset.ts";

// The Superset projects the stub knows at boot. Each repo matches the repo
// that a spec declares on the trellis project with the same key. Each path
// is a git checkout under the temp root of the run, so the server reads
// its default branch, main.
export const supersetProjects = (root: string) =>
	["cde", "bat", "fail"].map((name) => ({
		id: `sp-${name}`,
		name,
		repo: `acme/${name}`,
		path: join(root, "repos", name),
	}));

// Makes each project checkout, with origin/HEAD naming main as `git clone`
// leaves it.
export const createCheckouts = (root: string) => {
	for (const { path } of supersetProjects(root)) {
		execFileSync("git", ["init", "-q", path]);
		execFileSync("git", ["-C", path, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
	}
};

// The first state of stubs/superset.ts, which playwright.config.ts writes.
export const initialSupersetState = (root: string): StubState => ({
	projects: supersetProjects(root),
	workspaces: [],
	terminals: [],
	next: 1,
	failures: {},
});

// The stub files sit in the temp root of the run.
const dir = () => join(process.env.TRELLIS_E2E_ROOT!, "superset");
export const supersetStatePath = (root: string) => join(root, "superset", "state.json");
export const supersetLogPath = (root: string) => join(root, "superset", "calls.log");

export const supersetState = () => JSON.parse(readFileSync(join(dir(), "state.json"), "utf8")) as StubState;

// Every argument list the server and the simulated agents passed to the
// stub, oldest first.
export const supersetCalls = (): string[][] => {
	const log = join(dir(), "calls.log");
	if (!existsSync(log)) return [];
	return readFileSync(log, "utf8")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as string[]);
};

// The calls whose first two arguments are `command`, such as "ws create".
export const callsOf = (command: string) => supersetCalls().filter((call) => `${call[0]} ${call[1]}` === command);

// The argument that follows `name` in one call, or undefined.
export const flagOf = (call: string[], name: string) => {
	const index = call.indexOf(name);
	return index === -1 ? undefined : call[index + 1];
};

// The live terminal whose tab shows `title`, such as "CDE manager" or "CDE-3".
export const tabOf = (title: string) =>
	supersetState().terminals.find((terminal) => terminal.title === title && !terminal.exited);

// The texts that `superset terminals send` typed into one terminal, oldest
// first.
export const sentTo = (terminalId: string) =>
	callsOf("terminals send")
		.filter((call) => flagOf(call, "--terminal") === terminalId)
		.map((call) => flagOf(call, "--text")!);

// A pause of `ms` that blocks the thread, for the lock loop below.
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Makes `superset <command>` exit 1 with `message` on stderr, or with null
// answer again. The e2e stub runs one call at a time under the lock
// directory beside the state file, so this edit takes the same lock.
export const scriptFailure = (command: string, message: string | null) => {
	const path = join(dir(), "state.json");
	const lock = `${path}.lock`;
	for (;;) {
		try {
			mkdirSync(lock);
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			pause(5);
		}
	}
	const state = JSON.parse(readFileSync(path, "utf8")) as StubState;
	if (message === null) delete state.failures[command];
	else state.failures[command] = message;
	writeFileSync(path, JSON.stringify(state));
	rmSync(lock, { recursive: true });
};
