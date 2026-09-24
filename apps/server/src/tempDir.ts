import { afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Temporary directories for one test file. Each one sits under the directory
// that AGENTS.md names, with the prefix that the hourly sweep of the server
// reads.
//
// Call this once at the top of a test file and keep what it returns:
//
//     const tempDir = tempDirs();
//
// The call registers the hook that removes the directories, so each file
// gets its own hook. A hook at the top of this module would serve one file
// only, because bun evaluates a module one time for the whole run.
//
// The removal runs after each test, and not at the end of a test body. A
// failed expectation stops the body, and a directory that a test body must
// remove then stays on disk until the sweep of the next day.
//
// The path is what mkdtemp gives, and not the path that realpath resolves.
// macOS resolves the temporary directory of a person to another path, and a
// test that compares a path it wrote with a path it reads needs the two to
// match.
export const tempDirs = () => {
	const made: string[] = [];
	afterEach(async () => {
		await Promise.all(made.splice(0).map((path) => rm(path, { recursive: true, force: true })));
	});
	return async (prefix: string) => {
		const path = await mkdtemp(join(tmpdir(), prefix));
		made.push(path);
		return path;
	};
};
