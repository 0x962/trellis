import { type RunnerHostId, type RunnerHostRow, runnerUnavailable } from "./runner.ts";

// The machine a project's agents run on. Superset takes it as `--host
// <machineId>`; a project that names none runs its agents on the machine
// that runs the trellis server.

// One row of `superset hosts list --json`. Superset 1.28 prints `online` as
// "yes", "no", or "local"; an older or a newer build may print a boolean.
// "local" names the machine that runs Superset itself, which answers now.
type ListedHost = { id: string; name: string; online: boolean | string };

// `ws create` and `ws delete` want a target either way, so a project
// without a host keeps `--local`. The terminal verbs and `ws open` take
// this machine as their default, so they carry `--host` only for a project
// that names one.
export const target = (host: RunnerHostId) => (host === null ? ["--local"] : ["--host", host]);
export const onHost = (host: RunnerHostId) => (host === null ? [] : ["--host", host]);

// `json` runs one superset verb and parses what it printed. The runner
// hands its own in, so a host read fails the same way every other read
// does.
export const hostCalls = (json: <T>(args: string[]) => Promise<T>) => {
	const hosts = async (): Promise<RunnerHostRow[]> =>
		(await json<ListedHost[]>(["hosts", "list"])).map(({ id, name, online }) => ({
			id,
			name,
			online: online === true || online === "yes" || online === "local",
		}));

	// An agent runs only on a host that answers now. A host that went away or
	// went offline would make `superset ws create --host` fail with a message
	// about a machine id, so the check here names the machine instead, and
	// the failed session carries that line to the ticket.
	const assertHost = async (host: RunnerHostId) => {
		if (host === null) return;
		const found = (await hosts()).find((candidate) => candidate.id === host);
		if (found === undefined) {
			throw runnerUnavailable("host", `no Superset host carries the id ${host}. Pick a host in Settings.`);
		}
		if (!found.online) {
			throw runnerUnavailable("host", `the Superset host "${found.name}" is offline. Start it, or pick another one.`);
		}
	};

	return { hosts, assertHost };
};
