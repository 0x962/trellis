import { git } from "./git.ts";
import { target } from "./target.ts";
import type { WorkspaceCtx } from "./types.ts";
import { workspaceRevision } from "./workspaceRevision.ts";

export const readWorkspaceChanges = async (workspace: string) => {
	const state = await workspaceRevision(workspace);
	const diff = await git(workspace, ["diff", "--no-ext-diff", "--no-textconv", "HEAD", "--"]);
	return { ...state, diff, truncated: false };
};

export const workspace = async (ctx: WorkspaceCtx, input: { runId: string }) => {
	const selected = await ctx.newTx((tx) => target(tx, input));
	const changes = await readWorkspaceChanges(selected.workspace);
	return {
		...changes,
		runId: input.runId,
	};
};
