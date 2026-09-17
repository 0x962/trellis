import { git } from "./git.ts";
import { target } from "./target.ts";
import type { EvidenceCtx } from "./types.ts";
import { workspaceRevision } from "./workspaceRevision.ts";

export const workspace = async (ctx: EvidenceCtx, input: { runId: string }) => {
	const selected = await ctx.newTx((tx) => target(ctx.core, tx, input));
	const state = await workspaceRevision(selected.workspace);
	const diff = await git(selected.workspace, ["diff", "--no-ext-diff", "--no-textconv", "HEAD", "--"], {
		limit: 262145,
		truncate: true,
	});
	return {
		...state,
		runId: input.runId,
		attemptId: selected.attemptId,
		diff: diff.slice(0, 262144),
		truncated: diff.length > 262144,
	};
};
