import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import type { AgentRun } from "@trellis/api";
import { executionEnvironment } from "../../executionEnvironment";
import { gitCommonDirectory } from "./gitCommonDirectory.ts";
import {
	type NativeWorkspaceDependencies,
	nativeWorkspaceUnderExclusion,
} from "./nativeWorkspaceUnderExclusion.ts";
import { repositoryOperation } from "./repositoryOperation.ts";
export { agentWorkspace, agentWorkspacesRoot } from "./workspaceLayout.ts";

const exec = promisify(execFile);
type WorkspaceRun = Pick<AgentRun, "id" | "kind" | "runtime" | "ticketIdentifier" | "workspaceId">;

export async function nativeWorkspace(
	home: string,
	run: WorkspaceRun,
	directory: string,
	deps: Partial<NativeWorkspaceDependencies> = {},
) {
	if (directory === "") throw new Error("Select the local repository directory before you start a native agent.");
	const source = await realpath(directory);
	const git = deps.exec ?? exec;
	const env = await (deps.environment ?? executionEnvironment)();
	const commonDirectory = await gitCommonDirectory(source, env, git);
	return repositoryOperation(home, commonDirectory, () =>
		nativeWorkspaceUnderExclusion(home, run, source, {
			exec: git,
			environment: async () => env,
		}),
	);
}
