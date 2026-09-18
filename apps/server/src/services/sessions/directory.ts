import { execFile } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { executionEnvironment } from "../../executionEnvironment";

const exec = promisify(execFile);

// Scratch session repositories sit under `sessions/` in the data home.
export const sessionsRoot = (home: string) => join(home, "sessions");

// The names of the session directories on disk. A directory can outlive
// its row: a delete that failed after the row went, or a home restored from
// a backup. A new session never takes such a name.
export const sessionDirectoryNames = async (home: string) => {
	await mkdir(sessionsRoot(home), { recursive: true, mode: 0o700 });
	return readdir(sessionsRoot(home));
};

// A first commit lets workspace commands resolve HEAD. The fixed identity
// permits that commit when the machine has no Git identity.
const initializeRepository = async (directory: string) => {
	const env = { NODE_ENV: process.env.NODE_ENV, ...(await executionEnvironment()) };
	await exec("git", ["-C", directory, "init", "-q", "-b", "main"], { env });
	const commits = await exec("git", ["-C", directory, "rev-list", "--all", "--max-count=1", "--count"], { env });
	if (Number(commits.stdout.trim()) > 0) return directory;
	await exec(
		"git",
		[
			"-C",
			directory,
			"-c",
			"user.name=Trellis",
			"-c",
			"user.email=trellis@localhost",
			"commit",
			"-q",
			"--allow-empty",
			"--only",
			"-m",
			"Start the session",
		],
		{ env },
	);
	return directory;
};

export const createSessionRepository = async (home: string, name: string) => {
	const directory = join(sessionsRoot(home), name);
	await mkdir(directory, { mode: 0o700 });
	return initializeRepository(directory);
};

// A failed first launch can leave the directory or Git metadata incomplete.
// Repeated initialization preserves files and creates a commit only when Git has no history.
export const prepareSessionRepository = async (home: string, name: string) => {
	const directory = join(sessionsRoot(home), name);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	return initializeRepository(directory);
};

// Removes a session directory with every file in it. The path must sit
// inside the sessions root, so a wrong value in a row can never remove a
// directory outside it.
export const removeSessionDirectory = async (home: string, directory: string) => {
	const root = sessionsRoot(home);
	const target = resolve(directory);
	if (!target.startsWith(root + sep)) throw new Error(`${directory} is outside ${root}`);
	await rm(target, { recursive: true, force: true });
};
