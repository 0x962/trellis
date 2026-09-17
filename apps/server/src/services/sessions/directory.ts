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

// Creates the session directory as a git repository on `main` with one
// empty commit, so the agent starts in a repository that every git command
// accepts. The commit carries a fixed identity, because the machine may
// hold none. The directory must not exist yet.
export const createSessionRepository = async (home: string, name: string) => {
	const directory = join(sessionsRoot(home), name);
	await mkdir(directory, { mode: 0o700 });
	const env = { NODE_ENV: process.env.NODE_ENV, ...(await executionEnvironment()) };
	await exec("git", ["-C", directory, "init", "-q", "-b", "main"], { env });
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
			"-m",
			"Start the session",
		],
		{ env },
	);
	return directory;
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
