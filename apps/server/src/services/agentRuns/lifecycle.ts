import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import type { ServiceCtx } from "../support.ts";
import { refreshNative, stopNative } from "./nativeLifecycle.ts";
import { getRun, listColumns, type StoredRun } from "./queries.ts";

export const prepareStop = async (ctx: ServiceCtx, input: { id: string }) => {
	const run = await ctx.newTx(async (tx) => {
		const [run] = await rows<StoredRun>(
			tx,
			sql`UPDATE agent_runs SET closed_at=coalesce(closed_at,${ctx.now()}),updated_at=${ctx.now()} WHERE id=${input.id} AND runtime='native' RETURNING ${listColumns}`,
		);
		if (run) return run;
		await getRun(tx, input.id);
		throw invalidInput("id", "This historical assignment has no local process to stop.");
	});
	return stopNative(ctx, run);
};

// Stops the process of a run and keeps its assignment, so a person resumes
// the same conversation in the same workspace: `sessions.start` for a
// session, `agentRuns.resume` for the agent of a ticket.
//
// A flow step ends with its process, and `closeExitedAssignments` closes its
// run. A pause of such a run would leave a step that no flow can finish.
export const preparePause = async (ctx: ServiceCtx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime !== "native") throw invalidInput("id", "This historical assignment has no local process to pause.");
	if (run.kind === "flow") throw invalidInput("id", "A flow step runs to its end. Stop the flow run instead.");
	return stopNative(ctx, run, false);
};

export const prepareRefresh = async (ctx: ServiceCtx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime !== "native") return input;
	return refreshNative(ctx, run);
};
