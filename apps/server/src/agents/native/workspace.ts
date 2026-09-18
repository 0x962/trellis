import { execFile } from "node:child_process";
import { mkdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AgentRun } from "@trellis/api";
import { executionEnvironment } from "../../executionEnvironment";
import { runBranch } from "../launchCommand/branch.ts";
import { workspaceBaseRef } from "./workspaceBase.ts";
import { workspaceErrorText } from "./workspaceError/workspaceError.ts";

const exec = promisify(execFile);
type WorkspaceRun = Pick<AgentRun, "id" | "kind" | "runtime" | "ticketIdentifier" | "workspaceId">;

const sourceBase = async (source: string, env: NodeJS.ProcessEnv) => {
	const [reference, revision] = await Promise.all([
		exec("git", ["-C", source, "rev-parse", "--symbolic-full-name", "HEAD"], { env }),
		exec("git", ["-C", source, "rev-parse", "--verify", "HEAD"], { env }),
	]);
	return { reference: reference.stdout.trim(), revision: revision.stdout.trim() };
};

const setWorkspaceBase = async (
	workspace: string,
	base: Awaited<ReturnType<typeof sourceBase>>,
	env: NodeJS.ProcessEnv,
	preserveDetached: boolean,
) => {
	if (base.reference !== "HEAD") {
		await exec("git", ["-C", workspace, "symbolic-ref", workspaceBaseRef, base.reference], { env });
		return;
	}
	if (preserveDetached) {
		const current = await exec("git", ["-C", workspace, "rev-parse", "--verify", "--quiet", workspaceBaseRef], {
			env,
		}).catch(() => null);
		if (current !== null) return;
	}
	await exec("git", ["-C", workspace, "update-ref", workspaceBaseRef, base.revision], { env });
};

export const nativeWorkspace = async (home: string, run: WorkspaceRun, directory: string) => {
	if (directory === "") throw new Error("Select the local repository directory before you start a native agent.");
	const source = await realpath(directory);
	if (!(await stat(source)).isDirectory()) throw new Error(`Not a directory: ${source}`);
	if (run.workspaceId !== null && run.runtime === "native") {
		await stat(run.workspaceId);
		if (run.workspaceId !== source) {
			const env = { NODE_ENV: process.env.NODE_ENV, ...(await executionEnvironment()) };
			await setWorkspaceBase(run.workspaceId, await sourceBase(source, env), env, true);
		}
		return run.workspaceId;
	}
	const destination = join(home, "agents", run.id, "work");
	await mkdir(join(home, "agents", run.id), { recursive: true, mode: 0o700 });
	const env = { NODE_ENV: process.env.NODE_ENV, ...(await executionEnvironment()) };
	const base = await sourceBase(source, env);
	const branch = runBranch(run);
	await exec("git", ["-C", source, "worktree", "add", "-b", branch, destination, base.revision], {
		env,
	}).catch((error: { stderr?: string }) => {
		throw new Error(workspaceErrorText(error.stderr ?? ""), { cause: error });
	});
	await setWorkspaceBase(destination, base, env, false);
	return destination;
};
