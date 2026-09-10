import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StubState, StubTerminal } from "../stubs/superset.ts";

// supersetStub gives each test its own state for test/stubs/superset.ts. It
// sets TRELLIS_SUPERSET_STUB_STATE and TRELLIS_SUPERSET_STUB_LOG on
// process.env, and the stub reads them at each spawn, so a runner built with
// SUPERSET_STUB_BIN before the call uses the new state. restore() puts the
// two variables back.

export const SUPERSET_STUB_BIN = join(import.meta.dir, "..", "stubs", "superset.ts");

export type SupersetStubHandle = {
	bin: string;
	calls: () => string[][];
	callsOf: (command: string) => string[][];
	state: () => StubState;
	update: (change: (state: StubState) => void) => void;
	terminal: (terminalId: string) => StubTerminal;
	exit: (terminalId: string) => void;
	restore: () => void;
};

const envKeys = ["TRELLIS_SUPERSET_STUB_STATE", "TRELLIS_SUPERSET_STUB_LOG"] as const;

export const supersetStub = (dir: string, initial: Partial<StubState> = {}): SupersetStubHandle => {
	const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
	const file = join(dir, "superset-state.json");
	const log = join(dir, "superset-calls.log");
	const empty: StubState = { projects: [], workspaces: [], terminals: [], next: 1, failures: {} };
	writeFileSync(file, JSON.stringify({ ...empty, ...initial }));
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

// The arguments that follow `name` in one call.
export const flagOf = (call: string[], name: string) => call[call.indexOf(name) + 1];
