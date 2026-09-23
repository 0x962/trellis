import { stat } from "node:fs/promises";

// True when nothing is at `directory`. A stat that fails for another reason,
// such as a permission error on a parent directory, throws. A removal must
// not run on a guess: the entry of a live run would go, and the next launch
// of that run would ask a person the trust question.
const missingDirectory = async (directory: string) => {
	try {
		await stat(directory);
		return false;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
		throw error;
	}
};

// The keys of the Claude state file that name an agent worktree that is
// gone. `agentsDirectoryPrefix` is the resolved path of the directory that
// holds one worktree per agent run, with a trailing separator. A key outside
// that directory belongs to a person and never appears in the answer.
//
// Trellis creates one worktree per run and removes it when the run closes.
// Without this removal the state file grows by one key at every start and
// never shrinks, and each start reads and writes a larger file than the
// start before it.
export const trustEntriesToRemove = async (
	directories: string[],
	agentsDirectoryPrefix: string,
	missing: (directory: string) => Promise<boolean> = missingDirectory,
) => {
	const worktrees = directories.filter((directory) => directory.startsWith(agentsDirectoryPrefix));
	const answers = await Promise.all(worktrees.map(missing));
	return worktrees.filter((_, index) => answers[index]);
};
