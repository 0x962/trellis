import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StubState } from "./stubs/supersetCore";

// The Superset projects the stub knows at boot. Each repo matches the repo
// that dispatch.spec.ts declares on the trellis project with the same key.
export const supersetProjects = [
	{ id: "sp-cde", name: "cde", repo: "acme/cde", path: "/work/cde" },
	{ id: "sp-bat", name: "bat", repo: "acme/bat", path: "/work/bat" },
];

// The first state of stubs/superset.ts, which playwright.config.ts writes.
export const initialSupersetState: StubState = {
	projects: supersetProjects,
	workspaces: [],
	terminals: [],
	next: 1,
	failures: {},
};

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
