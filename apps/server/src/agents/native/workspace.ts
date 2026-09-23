import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { AgentRun } from "@trellis/api";
import { type ExecutionEnvironment, executionEnvironment } from "../../executionEnvironment";
import { runBranch } from "../launchCommand/branch.ts";
import { workspaceBaseRef } from "./workspaceBase.ts";
import { workspaceErrorText } from "./workspaceError/workspaceError.ts";

const exec = promisify(execFile);
type WorkspaceRun = Pick<AgentRun, "id" | "kind" | "runtime" | "ticketIdentifier" | "workspaceId">;
type GitExec = (file: string, args: string[], options: { env: NodeJS.ProcessEnv }) => Promise<{ stdout: string }>;
type Dependencies = {
	environment: () => Promise<ExecutionEnvironment>;
	exec: GitExec;
};

const sourceBase = async (source: string, env: NodeJS.ProcessEnv, git: GitExec = exec) => {
	const [reference, revision] = await Promise.all([
		git("git", ["-C", source, "rev-parse", "--symbolic-full-name", "HEAD"], { env }),
		git("git", ["-C", source, "rev-parse", "--verify", "HEAD"], { env }),
	]);
	return { reference: reference.stdout.trim(), revision: revision.stdout.trim() };
};

const setWorkspaceBase = async (
	workspace: string,
	base: Awaited<ReturnType<typeof sourceBase>>,
	env: NodeJS.ProcessEnv,
	preserveDetached: boolean,
	git: GitExec = exec,
) => {
	if (base.reference !== "HEAD") {
		await git("git", ["-C", workspace, "symbolic-ref", workspaceBaseRef, base.reference], { env });
		return;
	}
	if (preserveDetached) {
		const current = await git("git", ["-C", workspace, "rev-parse", "--verify", "--quiet", workspaceBaseRef], {
			env,
		}).catch(() => null);
		if (current !== null) return;
	}
	await git("git", ["-C", workspace, "update-ref", workspaceBaseRef, base.revision], { env });
};

// The directory that holds one worktree per agent run, and the worktree of
// one run inside it. Every reader of that layout calls these, so the layout
// has one statement in the code.
export const agentWorkspacesRoot = (home: string) => join(home, "agents");
export const agentWorkspace = (home: string, runId: string) => join(agentWorkspacesRoot(home), runId, "work");

export const nativeWorkspace = async (
	home: string,
	run: WorkspaceRun,
	directory: string,
	deps: Partial<Dependencies> = {},
) => {
	if (directory === "") throw new Error("Select the local repository directory before you start a native agent.");
	const source = await realpath(directory);
	if (!(await stat(source)).isDirectory()) throw new Error(`Not a directory: ${source}`);
	const git = deps.exec ?? exec;
	// The sweep removes the worktree of a run that is closed on a done ticket.
	// A run that starts again after that gets a new worktree on its branch.
	if (run.workspaceId !== null && run.runtime === "native" && existsSync(run.workspaceId)) {
		if (run.workspaceId !== source) {
			const env = await (deps.environment ?? executionEnvironment)();
			await setWorkspaceBase(run.workspaceId, await sourceBase(source, env, git), env, true, git);
		}
		return run.workspaceId;
	}
	const destination = agentWorkspace(home, run.id);
	await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
	const env = await (deps.environment ?? executionEnvironment)();
	const base = await sourceBase(source, env, git);
	const branch = runBranch(run);
	// The branch of the run survives the removal of its worktree, so a second
	// worktree checks the branch out where it stands.
	const branchExists = await git("git", ["-C", source, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
		env,
	}).then(
		() => true,
		() => false,
	);
	const target = branchExists ? [destination, branch] : ["-b", branch, destination, base.revision];
	await git("git", ["-C", source, "worktree", "add", ...target], {
		env,
	}).catch((error: { stderr?: string }) => {
		throw new Error(workspaceErrorText(error.stderr ?? ""), { cause: error });
	});
	await setWorkspaceBase(destination, base, env, false, git);
	return destination;
};
