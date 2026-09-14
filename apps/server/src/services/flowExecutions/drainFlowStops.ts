import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";
import { taskKey } from "../../agents/nativeFlow/taskKey.ts";
import { rows } from "../../db/queries/support.ts";
import { getRun } from "../agentRuns/queries.ts";
import { readExecution } from "./queries.ts";
import { recordStopError } from "./recordStopError.ts";
import type { FlowCtx } from "./types.ts";
export async function drainFlowStops(
	ctx: FlowCtx,
	id: string,
	stop: (ctx: FlowCtx, run: AgentRun) => Promise<unknown>,
) {
	const execution = await ctx.newTx((tx) => readExecution(tx, id));
	const tasks = await ctx.newTx((tx) =>
		rows<{ key: string; run_id: string; attempt_id: string; result_id: string | null }>(
			tx,
			sql`SELECT key,run_id,attempt_id,result_id FROM flow_execution_tasks WHERE execution_id=${id}`,
		),
	);
	const errors: string[] = [];
	for (const task of tasks) {
		const step = execution.state.steps.find((step) => taskKey(step) === task.key);
		if (task.result_id === null && !step?.needsStop && step?.state !== "failed") continue;
		const run = await ctx.newTx((tx) => getRun(tx, task.run_id));
		if (run.terminalId !== task.attempt_id) {
			const error = `Flow task ${task.key} no longer owns its recorded attempt`;
			errors.push(error);
			await ctx.newTx((tx) => recordStopError(ctx.core, tx, { id, key: task.key, error }));
			continue;
		}
		let failure: string | null = null;
		try {
			if (!["stopped", "exited", "failed"].includes(run.state)) await stop(ctx, run);
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
		if (failure !== null) errors.push(failure);
		await ctx.newTx((tx) => recordStopError(ctx.core, tx, { id, key: task.key, error: failure }));
	}
	return errors;
}
