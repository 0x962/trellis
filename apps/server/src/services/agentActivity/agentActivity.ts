import type { AgentActivity } from "@trellis/api";
import { activityRuns } from "../agentRuns.ts";
import { sessionIdsForRuns } from "../sessions";
import type { IoCtx } from "../support.ts";

export const activity = async (ctx: IoCtx): Promise<AgentActivity[]> => {
	const runs = await activityRuns(ctx);
	const sessionIds = await ctx.newTx((tx) => sessionIdsForRuns(ctx.core, tx, { runIds: runs.map((run) => run.id) }));
	return runs.flatMap((run) => {
		const sessionId = sessionIds[run.id] ?? null;
		return run.kind === "session" && sessionId === null ? [] : [{ run, sessionId }];
	});
};
