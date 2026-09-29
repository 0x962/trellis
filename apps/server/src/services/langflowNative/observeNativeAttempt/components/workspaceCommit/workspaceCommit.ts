import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function workspaceCommit(
	workspace: string,
	execute: (file: string, args: string[]) => Promise<{ stdout: string }> = exec,
) {
	return execute("git", ["-C", workspace, "rev-parse", "--verify", "--quiet", "HEAD"]).then(
		(value) => value.stdout.trim(),
		(error: { code?: string | number }) => {
			if (error.code === 1) return null;
			throw error;
		},
	);
}
