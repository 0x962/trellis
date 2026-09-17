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
export const nativeWorkspace = async (home: string, run: WorkspaceRun, directory: string) => {
	if (directory === "") throw new Error("Select the local repository directory before you start a native agent.");
	const source = await realpath(directory);
	if (!(await stat(source)).isDirectory()) throw new Error(`Not a directory: ${source}`);
	if (run.workspaceId !== null && run.runtime === "native") {
		await stat(run.workspaceId);
		if (run.kind !== "manager") {
			const env = { NODE_ENV: process.env.NODE_ENV, ...(await executionEnvironment()) };
			await exec("git", ["-C", run.workspaceId, "rev-parse", "--verify", "--quiet", workspaceBaseRef], { env }).catch(
				async () => {
					const base = (await exec("git", ["-C", source, "rev-parse", "--verify", "HEAD"], { env })).stdout.trim();
					await exec("git", ["-C", run.workspaceId!, "update-ref", workspaceBaseRef, base], { env });
				},
			);
		}
		return run.workspaceId;
	}
	if (run.kind === "manager") return source;
	const destination = join(home, "agents", run.id, "work");
	await mkdir(join(home, "agents", run.id), { recursive: true, mode: 0o700 });
	const env = { NODE_ENV: process.env.NODE_ENV, ...(await executionEnvironment()) };
	const base = (await exec("git", ["-C", source, "rev-parse", "--verify", "HEAD"], { env })).stdout.trim();
	await exec("git", ["-C", source, "worktree", "add", "-b", runBranch(run), destination, base], {
		env,
	}).catch((error: { stderr?: string }) => {
		throw new Error(workspaceErrorText(error.stderr ?? ""), { cause: error });
	});
	await exec("git", ["-C", destination, "update-ref", workspaceBaseRef, base], { env });
	return destination;
};
