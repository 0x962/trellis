import { execFile } from "node:child_process";
import { mkdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AgentRun } from "@trellis/api";
import { executionEnvironment } from "../../executionEnvironment";
import { runBranch } from "../launchCommand/branch.ts";

const exec = promisify(execFile);
export const nativeWorkspace = async (
	home: string,
	run: Omit<AgentRun, "state" | "processStatus" | "observation">,
	directory: string,
) => {
	if (directory === "") throw new Error("Select the local repository directory before you start a native agent.");
	const source = await realpath(directory);
	if (!(await stat(source)).isDirectory()) throw new Error(`Not a directory: ${source}`);
	if (run.workspaceId !== null && run.runtime === "native") {
		await stat(run.workspaceId);
		return run.workspaceId;
	}
	if (run.kind === "manager") return source;
	const destination = join(home, "agents", run.id, "work");
	await mkdir(join(home, "agents", run.id), { recursive: true, mode: 0o700 });
	await exec("git", ["-C", source, "worktree", "add", "-b", runBranch(run), destination, "HEAD"], {
		env: { NODE_ENV: process.env.NODE_ENV, ...(await executionEnvironment()) },
	});
	return destination;
};
