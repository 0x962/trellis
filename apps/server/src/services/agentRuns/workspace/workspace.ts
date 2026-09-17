import { git } from "./git.ts";
import { target } from "./target.ts";
import type { WorkspaceCtx } from "./types.ts";
import { workspaceRevision } from "./workspaceRevision.ts";

export const workspace = async (ctx: WorkspaceCtx, input: { runId: string }) => {
	const selected = await ctx.newTx((tx) => target(tx, input));
	const state = await workspaceRevision(selected.workspace);
	const diff = await git(selected.workspace, ["diff", "--no-ext-diff", "--no-textconv", "HEAD", "--"], {
		limit: 262145,
		truncate: true,
	});
	return {
		...state,
		runId: input.runId,
		diff: diff.slice(0, 262144),
		truncated: diff.length > 262144,
	};
};
