import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StubState, StubTerminal } from "../stubs/superset.ts";

// supersetStub gives a test file its own state for test/stubs/superset.ts.
// It sets TRELLIS_SUPERSET_STUB_STATE and TRELLIS_SUPERSET_STUB_LOG on
// process.env, and the stub reads them at each spawn. A database worker
// copies process.env when it starts, so a file calls supersetStub before it
// builds its app, and `reset` gives each test new state in the same files.
// restore() puts the two variables back.

export const SUPERSET_STUB_BIN = join(import.meta.dir, "..", "stubs", "superset.ts");

export type SupersetStubHandle = {
	bin: string;
	calls: () => string[][];
	callsOf: (command: string) => string[][];
	state: () => StubState;
	update: (change: (state: StubState) => void) => void;
	// New state and an empty call log. The id counter keeps counting, so a
	// runner id stays unique across the tests of one file.
	reset: (initial: Partial<StubState>) => void;
	// Empties the call log and leaves the state, so a test asserts only the
	// calls that follow its setup.
	clearCalls: () => void;
	terminal: (terminalId: string) => StubTerminal;
	exit: (terminalId: string) => void;
	restore: () => void;
};

const envKeys = ["TRELLIS_SUPERSET_STUB_STATE", "TRELLIS_SUPERSET_STUB_LOG"] as const;

const empty = (): StubState => ({ projects: [], workspaces: [], terminals: [], next: 1, failures: {}, garbage: [] });

export const supersetStub = (dir: string, initial: Partial<StubState> = {}): SupersetStubHandle => {
	const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
	const file = join(dir, "superset-state.json");
	const log = join(dir, "superset-calls.log");
	writeFileSync(file, JSON.stringify({ ...empty(), ...initial }));
	process.env.TRELLIS_SUPERSET_STUB_STATE = file;
	process.env.TRELLIS_SUPERSET_STUB_LOG = log;

	const state = () => JSON.parse(readFileSync(file, "utf8")) as StubState;
	const update = (change: (current: StubState) => void) => {
		const current = state();
		change(current);
		writeFileSync(file, JSON.stringify(current));
	};
	const calls = () =>
		existsSync(log)
			? readFileSync(log, "utf8")
					.split("\n")
					.filter((line) => line.length > 0)
					.map((line) => JSON.parse(line) as string[])
			: [];

	return {
		bin: SUPERSET_STUB_BIN,
		calls,
		// The calls whose first two arguments are `command`, such as "ws create".
		callsOf: (command) => calls().filter((call) => `${call[0]} ${call[1]}` === command),
		state,
		update,
		reset: (next) => {
			writeFileSync(file, JSON.stringify({ ...empty(), ...next, next: state().next }));
			rmSync(log, { force: true });
		},
		clearCalls: () => rmSync(log, { force: true }),
		terminal: (terminalId) => state().terminals.find((terminal) => terminal.terminalId === terminalId)!,
		exit: (terminalId) =>
			update((current) => {
				current.terminals.find((terminal) => terminal.terminalId === terminalId)!.exited = true;
			}),
		restore: () => {
			for (const key of envKeys) {
				const value = saved[key];
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
			rmSync(log, { force: true });
		},
	};
};

// The argument that follows `name` in one call.
export const flagOf = (call: string[], name: string) => call[call.indexOf(name) + 1];
