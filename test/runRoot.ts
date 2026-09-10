import { mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

// A run root is one temp directory that holds every home of one test run.
// Its name is `<prefix><owner pid>-<random>`, so a later run can tell if the
// process that made the root still runs.
export const RUN_ROOT_PREFIX = "trellis-run-";

export const createRunRoot = (parent: string, prefix: string) => mkdtempSync(join(parent, `${prefix}${process.pid}-`));

// Signal 0 sends nothing and only looks up the pid. ESRCH means that no
// process has the pid. EPERM means that a process of another user has it.
const isAlive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
};

// Removes each root in `parent` whose owner pid is dead. Two runs can sweep
// at the same time, so a sweeper first renames the root to a name with its
// own live pid, and only the sweeper whose rename succeeds removes it. A
// sweeper that dies during the removal leaves a name with a dead pid, and
// the next sweep removes that root.
export const sweepDeadRoots = (parent: string, prefix: string) => {
	const owned = new RegExp(`^${prefix}(\\d+)-.`);
	for (const name of readdirSync(parent)) {
		const owner = owned.exec(name)?.[1];
		if (owner === undefined || isAlive(Number(owner))) continue;
		const claimed = join(parent, `${prefix}${process.pid}-swept-${name}`);
		try {
			renameSync(join(parent, name), claimed);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		rmSync(claimed, { recursive: true, force: true });
	}
};
