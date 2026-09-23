import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { lock } from "proper-lockfile";

type NativeState = {
	hasCompletedOnboarding?: boolean;
	projects?: Record<string, { hasTrustDialogAccepted?: boolean; [key: string]: unknown }>;
	[key: string]: unknown;
};

// The launches that wait for the next write of one state file.
// `directories` holds the worktree of each of them, and `result` settles
// when that write finishes.
type Batch = { directories: Set<string>; result: Promise<void> };

// The batch that collects launches for a state file. The key is the path of
// the state file.
const waiting = new Map<string, Batch>();
// The write that runs now for a state file. The next batch starts after it.
const running = new Map<string, Promise<void>>();

// True when a launch in `cwd` needs no answer from a person: the directory
// is trusted and the first-run questions are done.
const ready = (state: NativeState, directory: string) =>
	state.hasCompletedOnboarding === true && state.projects?.[directory]?.hasTrustDialogAccepted === true;

// Writes the state file one time for every directory in `directories`. The file
// also loses the entry of each agent worktree that is gone. Trellis creates
// one worktree per run and removes it when the run closes, so without the
// removal the file grows by one entry at every start and never shrinks, and
// each start reads and writes a larger file than the start before it. An
// entry outside `agentsDirectory` belongs to a person and stays.
const writeBatch = async (statePath: string, directories: Set<string>, agentsDirectory: string) => {
	await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
	const release = await lock(statePath, {
		lockfilePath: `${statePath}.lock`,
		realpath: false,
		retries: { retries: 80, minTimeout: 25, maxTimeout: 250 },
	});
	let temporary: string | undefined;
	try {
		const exists = existsSync(statePath);
		const file = exists ? await realpath(statePath) : statePath;
		const state: NativeState = exists ? JSON.parse(await readFile(file, "utf8")) : {};
		const projects = { ...state.projects };
		// `stat` gives the event loop back to the server between the entries.
		// The file holds one entry per start until the first write of this
		// version, so the first run of this loop reads hundreds of directories.
		const worktrees = Object.keys(projects).filter((directory) => directory.startsWith(agentsDirectory));
		const gone = await Promise.all(
			worktrees.map((directory) =>
				stat(directory).then(
					() => null,
					() => directory,
				),
			),
		);
		for (const directory of gone) if (directory !== null) delete projects[directory];
		for (const directory of directories) projects[directory] = { ...projects[directory], hasTrustDialogAccepted: true };
		state.hasCompletedOnboarding = true;
		state.projects = projects;
		const mode = exists ? (await stat(file)).mode & 0o777 : 0o600;
		temporary = join(dirname(file), `.trellis-claude-trust-${randomUUID()}`);
		await writeFile(temporary, JSON.stringify(state, null, 2), { flag: "wx", mode });
		await chmod(temporary, mode);
		await rename(temporary, file);
	} finally {
		try {
			if (temporary) await rm(temporary, { force: true });
		} finally {
			await release();
		}
	}
};

// Opens the batch that the next write of `statePath` covers. The write starts
// after the write in flight, and the launches that arrive in the meantime
// join this batch.
const openBatch = (statePath: string, agentsDirectory: string): Batch => {
	const directories = new Set<string>();
	const result = (running.get(statePath) ?? Promise.resolve()).then(() => {
		waiting.delete(statePath);
		return writeBatch(statePath, directories, agentsDirectory);
	});
	const batch: Batch = { directories, result };
	waiting.set(statePath, batch);
	// A failed write gives its error to the launches of that batch through
	// `result`. The next batch still runs, so the chain drops the error.
	running.set(
		statePath,
		result.then(
			() => {},
			() => {},
		),
	);
	return batch;
};

// Marks `cwd` as trusted and the first-run setup as complete in the state
// file of the Claude profile that `env` selects. A launched Claude receives
// its prompt as an argument, so a trust question or the first-run theme
// question would hold the process forever with no one to answer it.
// `agentsDirectory` is the directory that holds every agent worktree, which
// is `agents` under the Trellis data home.
export async function claudeTrust(cwd: string, env: Record<string, string>, agentsDirectory: string) {
	const home = env.HOME ?? homedir();
	const configDirectory = resolve(cwd, env.CLAUDE_CONFIG_DIR || join(home, ".claude"));
	const legacy = join(configDirectory, ".config.json");
	const suffix = env.CLAUDE_CODE_CUSTOM_OAUTH_URL ? "-custom-oauth" : "";
	const statePath = existsSync(legacy) ? legacy : resolve(cwd, env.CLAUDE_CONFIG_DIR || home, `.claude${suffix}.json`);
	const canonicalDirectory = (await realpath(cwd)).normalize("NFC");
	if (existsSync(statePath)) {
		const state: NativeState = JSON.parse(await readFile(statePath, "utf8"));
		if (ready(state, canonicalDirectory)) return;
	}
	const root = agentsDirectory.endsWith(sep) ? agentsDirectory : `${agentsDirectory}${sep}`;
	const batch = waiting.get(statePath) ?? openBatch(statePath, root);
	batch.directories.add(canonicalDirectory);
	await batch.result;
}
