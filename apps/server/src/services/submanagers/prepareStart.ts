import { closeExitedAssignments } from "../agentRuns/closeExitedAssignments.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import type { IoCtx } from "../support.ts";
import { requireManager } from "./access.ts";
import { type Input, reserveSubmanager } from "./reserveSubmanager.ts";

export const prepareStart = async (ctx: IoCtx, input: Input) => {
	await ctx.newTx((tx) => requireManager(ctx.core, tx));
	const sessions = await closeExitedAssignments(ctx, undefined, true);
	const exited = sessions.filter((session) => session.status === "exited").map((session) => session.id);
	const reservation = await ctx.newTx((tx) => reserveSubmanager(ctx.core, tx, input, exited));
	if (reservation.replay) return { id: reservation.run.id };
	ctx.emit({ type: "agent-runs.changed", id: reservation.run.id });
	return startNative(ctx, reservation);
};
