import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { executionEnvironment } from "../../../../executionEnvironment";
import { removeSessionDirectory } from "../../directory.ts";

const exec = promisify(execFile);

export async function removeCleanDirectory(
	input: { home: string; runId: string; directory: string; openPaths: string[] },
	beforeRemove: () => Promise<void>,
) {
	const { home, runId, directory } = input;
	const target = resolve(directory);
	const worktree = target === join(home, "agents", runId, "work");
	if (!worktree && dirname(target) !== join(home, "sessions"))
		throw new Error("The session directory is outside its managed location.");
	const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return null;
		throw error;
	});
	if (info === null) {
		await beforeRemove();
		return true;
	}
	const root = await realpath(home);
	const canonical = await realpath(target);
	if (info.isSymbolicLink() || canonical !== join(root, relative(home, target)))
		throw new Error("The session directory resolves outside its managed location.");
	if (
		input.openPaths.some((path) =>
			[target, canonical].some((directory) => path === directory || path.startsWith(directory + sep)),
		)
	)
		return false;
	const env = await executionEnvironment();
	const status = () =>
		exec("git", ["-C", target, "status", "--porcelain", "--untracked-files=all", "--ignored"], { env });
	if ((await status()).stdout.length > 0) return false;
	await beforeRemove();
	if ((await status()).stdout.length > 0) return false;
	if (worktree) await exec("git", ["-C", target, "worktree", "remove", target], { env });
	else await removeSessionDirectory(home, target);
	return true;
}
