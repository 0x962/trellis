import type { SessionDetail } from "@trellis/api";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { launchState } from "../agentRuns/launchState";
import { observeRuns, projectRun } from "../agentRuns/liveState.ts";
import { getRun, listSessionRuns } from "../agentRuns/queries.ts";
import type { IoCtx } from "../support.ts";
import { listSessions, resolveSession } from "./queries.ts";

export const list = async (_ctx: CoreCtx, tx: Tx, _input: Record<string, never>) => listSessions(tx);

// One session with the observed state of its run.
export const observe = async (ctx: IoCtx, input: { id: string }): Promise<SessionDetail> => {
	const session = await ctx.newTx((tx) => resolveSession(tx, input.id));
	const run = await ctx.newTx((tx) => getRun(tx, session.runId));
	const [observed] = await observeRuns(ctx, [run]);
	return { ...session, run: observed! };
};

export const accepted = async (ctx: IoCtx, input: { id: string }): Promise<SessionDetail> => {
	const { session, run } = await ctx.newTx(async (tx) => {
		const session = await resolveSession(tx, input.id);
		return { session, run: await getRun(tx, session.runId) };
	});
	if (run.terminalId !== null && launchState.has(ctx.home, run.terminalId))
		return { ...session, run: projectRun(run, [], ctx.home) };
	return observe(ctx, input);
};

export const finish = async (ctx: IoCtx, _tx: Tx, input: SessionDetail) => {
	ctx.emit({ type: "sessions.changed", id: input.id });
	ctx.emit({ type: "agent-runs.changed", id: input.runId });
	return input;
};

export const activity = async (ctx: IoCtx): Promise<SessionDetail[]> => {
	const entries = await ctx.newTx(async (tx) => {
		const sessions = await listSessions(tx);
		const runs = await listSessionRuns(tx);
		return { sessions, runs };
	});
	const runs = new Map((await observeRuns(ctx, entries.runs)).map((run) => [run.id, run]));
	return entries.sessions.map((session) => ({ ...session, run: runs.get(session.runId)! }));
};
