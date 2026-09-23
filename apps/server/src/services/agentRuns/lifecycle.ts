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

export const prepareRefresh = async (ctx: ServiceCtx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime !== "native") return input;
	return refreshNative(ctx, run);
};
