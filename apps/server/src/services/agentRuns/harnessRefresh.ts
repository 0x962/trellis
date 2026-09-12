import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";
import { commandHarness } from "../../agents/commandHarness/commandHarness.ts";
import { attempt } from "../../agents/superset/attempt.ts";
import type { ServiceCtx } from "../support.ts";

export const refreshHarness = async (ctx: ServiceCtx, run: AgentRun) => {
	if (run.state !== "running" && run.state !== "interrupted") return { id: run.id };
	const result = await attempt(async () => {
		if (run.state === "interrupted") {
			const place = await (await commandHarness(ctx.home, run)).recover();
			run = { ...run, ...place };
			await ctx.newTx((tx) =>
				tx.execute(
					sql`UPDATE agent_runs SET workspace_id = ${place.workspaceId}, terminal_id = ${place.terminalId} WHERE id = ${run.id}`,
				),
			);
		}
		const harness = await commandHarness(ctx.home, run);
		const health = await harness.healthcheck();
		const url = await harness.url();
		return { state: health.state, url };
	});
	await ctx.newTx((tx) =>
		result.ok
			? tx.execute(
					sql`UPDATE agent_runs SET state = ${result.value.state}, url = ${result.value.url}, error = NULL, updated_at = ${ctx.now()} WHERE id = ${run.id}`,
				)
			: tx.execute(sql`UPDATE agent_runs SET error = ${result.error}, updated_at = ${ctx.now()} WHERE id = ${run.id}`),
	);
	return { id: run.id };
};
