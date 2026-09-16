import { execFile } from "node:child_process";
import { mkdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AgentRun } from "@trellis/api";
import { type ExecutionEnvironment, executionEnvironment } from "../../executionEnvironment";
import { runBranch } from "../launchCommand/branch.ts";

const exec = promisify(execFile);
type Dependencies = {
	environment: () => Promise<ExecutionEnvironment>;
	exec: (file: string, args: string[], options: { env: NodeJS.ProcessEnv }) => Promise<unknown>;
};
export const nativeWorkspace = async (
	home: string,
	run: Omit<AgentRun, "state" | "processStatus" | "observation">,
	directory: string,
	deps: Partial<Dependencies> = {},
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
	await (deps.exec ?? exec)("git", ["-C", source, "worktree", "add", "-b", runBranch(run), destination, "HEAD"], {
		env: (await (deps.environment ?? executionEnvironment)()) as NodeJS.ProcessEnv,
	});
	return destination;
};
