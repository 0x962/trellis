import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { lock } from "proper-lockfile";
import type { JobsLog } from "../../jobs.ts";
import { trustEntriesToRemove } from "./trustEntries.ts";

type NativeState = {
	hasCompletedOnboarding?: boolean;
	projects?: Record<string, { hasTrustDialogAccepted?: boolean; [key: string]: unknown }>;
	[key: string]: unknown;
};

// The launches that wait for the next write of one state file.
// `directories` holds the worktree of each of them. `written` is done when
// that write is done, and it gives the error of a failed write.
type Batch = { directories: Set<string>; written: Promise<void> };

// The batch that the next write of a state file covers. The key is the path
// of the state file.
const nextBatch = new Map<string, Batch>();
// The write that runs now for a state file. The key is the same.
const writeInFlight = new Map<string, Promise<void>>();

// True when a launch in `cwd` needs no answer from a person: the directory
// is trusted and the first-run questions are done.
const ready = (state: NativeState, directory: string) =>
	state.hasCompletedOnboarding === true && state.projects?.[directory]?.hasTrustDialogAccepted === true;

type WriteInput = {
	statePath: string;
	directories: Set<string>;
	agentsDirectory: string;
	log: JobsLog;
};

// Writes the state file one time for every directory in `directories`, and
// removes the key of each agent worktree that is gone.
const writeBatch = async ({ statePath, directories, agentsDirectory, log }: WriteInput) => {
	// A key of the state file is the resolved path of a worktree, so the
	// prefix it is compared against is the resolved path of the agents
	// directory. A symbolic link in the Trellis data home would otherwise
	// leave the two forms different, and nothing would match.
	const agentsDirectoryPrefix = `${(await realpath(agentsDirectory)).normalize("NFC")}${sep}`;
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
		for (const directory of await trustEntriesToRemove(Object.keys(projects), agentsDirectoryPrefix))
			delete projects[directory];
		const removed = Object.keys(state.projects ?? {}).length - Object.keys(projects).length;
		for (const directory of directories) projects[directory] = { ...projects[directory], hasTrustDialogAccepted: true };
		state.hasCompletedOnboarding = true;
		state.projects = projects;
		const mode = exists ? (await stat(file)).mode & 0o777 : 0o600;
		const text = JSON.stringify(state, null, 2);
		temporary = join(dirname(file), `.trellis-claude-trust-${randomUUID()}`);
		await writeFile(temporary, text, { flag: "wx", mode });
		await chmod(temporary, mode);
		await rename(temporary, file);
		log("claude trust written", {
			file,
			trusted: directories.size,
			removed,
			entries: Object.keys(projects).length,
			bytes: text.length,
		});
	} finally {
		try {
			if (temporary) await rm(temporary, { force: true });
		} finally {
			await release();
		}
	}
};

// Opens the batch that the next write of `statePath` covers. The write
// starts after the write that runs now, and the launches that arrive in the
// meantime join this batch.
const openBatch = (input: Omit<WriteInput, "directories">): Batch => {
	const { statePath, log } = input;
	const directories = new Set<string>();
	const written = (writeInFlight.get(statePath) ?? Promise.resolve()).then(() => {
		nextBatch.delete(statePath);
		return writeBatch({ ...input, directories });
	});
	const batch: Batch = { directories, written };
	nextBatch.set(statePath, batch);
	// A failed write gives its error to the launches of that batch through
	// `written`. The two functions here take that error a second time and
	// write a log line, so the next batch still starts.
	writeInFlight.set(
		statePath,
		written.then(
			() => {},
			(error: unknown) => {
				log("claude trust write failed", {
					file: statePath,
					error: error instanceof Error ? error.message : String(error),
				});
			},
		),
	);
	return batch;
};

// Marks `cwd` as trusted and the first-run setup as complete in the state
// file of the Claude profile that `env` selects. A launched Claude receives
// its prompt as an argument, so a trust question or the first-run theme
// question would hold the process forever with no one to answer it.
//
// `agentsDirectory` is the directory that holds one worktree per agent run.
// The write removes the keys under it whose worktree is gone.
export async function claudeTrust(
	cwd: string,
	env: Record<string, string>,
	agentsDirectory: string,
	log: JobsLog = () => {},
) {
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
	const batch = nextBatch.get(statePath) ?? openBatch({ statePath, agentsDirectory, log });
	batch.directories.add(canonicalDirectory);
	await batch.written;
}
