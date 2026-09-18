import { stat } from "node:fs/promises";
import type { AgentWorkspaceSummary, ReadyWorkspaceSummary } from "@trellis/api";
import { workspaceBaseRef } from "../../../agents/native/workspaceBase.ts";
import { getRun } from "../queries.ts";
import { git } from "./git.ts";
import { changeStats } from "./lineStats.ts";
import type { WorkspaceCtx } from "./types.ts";

// `scratch` is true for the repository of a session that has no project.
export type SummaryTarget = { runId: string; workspace: string; scratch: boolean };

// The commit that the counts start from. A project workspace starts from
// `workspaceBaseRef`. A scratch repository has no such ref, so it starts
// from its first commit, which holds no files.
const startCommit = async ({ workspace, scratch }: SummaryTarget) => {
	if (!scratch) return (await git(workspace, ["rev-parse", "--verify", workspaceBaseRef])).trim();
	return (await git(workspace, ["rev-list", "--max-parents=0", "HEAD"])).trim().split("\n").at(-1)!;
};

const uncommittedFiles = async (workspace: string) => {
	const [changed, untracked] = await Promise.all([
		git(workspace, ["diff", "--name-only", "-z", "HEAD", "--"]),
		git(workspace, ["ls-files", "--others", "--exclude-standard", "-z"]),
	]);
	const count = (text: string) => text.split("\0").filter((path) => path !== "" && !path.endsWith("/")).length;
	return count(changed) + count(untracked);
};

export const readWorkspace = async (target: SummaryTarget): Promise<ReadyWorkspaceSummary> => {
	const { runId, workspace, scratch } = target;
	const start = await startCommit(target);
	// `rev-parse --symbolic-full-name` prints `refs/heads/main` when the base
	// ref points at the branch `main`. It prints the name of the base ref
	// itself when that ref holds a commit.
	const [branch, head, baseRef, commits, stats, uncommitted] = await Promise.all([
		git(workspace, ["branch", "--show-current"]),
		git(workspace, ["rev-parse", "--short", "HEAD"]),
		scratch ? "" : git(workspace, ["rev-parse", "--symbolic-full-name", workspaceBaseRef]),
		git(workspace, ["rev-list", "--left-right", "--count", `${start}...HEAD`]),
		changeStats(workspace, start),
		uncommittedFiles(workspace),
	]);
	const [behind, ahead] = commits.trim().split("\t").map(Number);
	const base = baseRef.trim();
	return {
		runId,
		directory: workspace,
		state: "ready",
		branch: branch.trim() || null,
		head: head.trim(),
		base: base.startsWith("refs/heads/") ? base.slice("refs/heads/".length) : null,
		ahead: ahead!,
		behind: behind!,
		...stats,
		uncommitted,
	};
};

// Two reads of one workspace at the same time share one run of Git. At
// most two workspaces are read at once, so thirty rows of a large
// repository do not start thirty Git processes together.
const inFlight = new Map<string, Promise<AgentWorkspaceSummary>>();
const concurrency = 2;
let active = 0;
const queue: (() => void)[] = [];
const acquire = () =>
	new Promise<void>((resolve) => {
		if (active < concurrency) {
			active += 1;
			resolve();
		} else queue.push(resolve);
	});
const release = () => {
	const next = queue.shift();
	if (next) next();
	else active -= 1;
};

// The summary of one workspace. A directory that is not on disk gives
// `missing`. A Git failure, such as a deleted base branch, gives
// `unreadable` with the text Git printed.
export const summarizeWorkspace = (target: SummaryTarget): Promise<AgentWorkspaceSummary> => {
	const current = inFlight.get(target.workspace);
	if (current) return current;
	const promise = (async (): Promise<AgentWorkspaceSummary> => {
		const base = { runId: target.runId, directory: target.workspace };
		const exists = await stat(target.workspace).then(
			() => true,
			() => false,
		);
		if (!exists) return { ...base, state: "missing" };
		await acquire();
		try {
			return await readWorkspace(target);
		} catch (error) {
			return { ...base, state: "unreadable", error: (error as Error).message };
		} finally {
			release();
		}
	})().finally(() => inFlight.delete(target.workspace));
	inFlight.set(target.workspace, promise);
	return promise;
};

export const summary = async (ctx: WorkspaceCtx, input: { runId: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.runId));
	return summarizeWorkspace({ runId: run.id, workspace: run.workspaceId!, scratch: run.projectId === null });
};
