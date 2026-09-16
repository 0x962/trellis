import type { SessionDetail } from "@trellis/api";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { observeRuns } from "../agentRuns/liveState.ts";
import { getRun } from "../agentRuns/queries.ts";
import type { IoCtx } from "../support.ts";
import { getSession, listSessions } from "./queries.ts";

export const list = async (_ctx: CoreCtx, tx: Tx, _input: Record<string, never>) => listSessions(tx);

// One session with the observed state of its run.
export const observe = async (ctx: IoCtx, input: { id: string }): Promise<SessionDetail> => {
	const session = await ctx.newTx((tx) => getSession(tx, input.id));
	const run = await ctx.newTx((tx) => getRun(tx, session.runId));
	const [observed] = await observeRuns(ctx, [run]);
	return { ...session, run: observed! };
};

export const finish = async (ctx: IoCtx, _tx: Tx, input: SessionDetail) => {
	ctx.emit({ type: "sessions.changed", id: input.id });
	ctx.emit({ type: "agent-runs.changed", id: input.runId });
	return input;
};
