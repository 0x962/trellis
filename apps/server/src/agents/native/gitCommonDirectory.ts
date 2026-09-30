import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

type GitExec = (
	file: string,
	args: string[],
	options: { env: NodeJS.ProcessEnv },
) => Promise<{ stdout: string }>;

export async function gitCommonDirectory(
	directory: string,
	env: NodeJS.ProcessEnv,
	git: GitExec = exec,
): Promise<string> {
	const result = await git("git", ["-C", directory, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
		env,
	});
	return realpath(result.stdout.trim());
}
