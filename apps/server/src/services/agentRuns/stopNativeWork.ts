import { sql } from "drizzle-orm";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { ServiceCtx } from "../support.ts";
import { setNativeWork } from "./nativeControl.ts";
import { stopNative } from "./nativeLifecycle.ts";
import { columns, type StoredRun } from "./queries.ts";

export const stopNativeWork = async (ctx: ServiceCtx & { core: CoreCtx }) => {
	const runs = await ctx.newTx(async (tx) => {
		await setNativeWork(ctx.core, tx, { paused: true });
		const projects = await rows<{ id: string }>(
			tx,
			sql`UPDATE projects SET manager_config = jsonb_set(manager_config, '{dispatchPaused}', 'true'), updated_at = ${ctx.now()} WHERE manager_config IS NOT NULL RETURNING id`,
		);
		await ctx.core.cache.rebuild(tx);
		for (const project of projects) ctx.emit({ type: "project.updated", id: project.id });
		return rows<StoredRun>(tx, sql`SELECT ${columns} FROM agent_runs WHERE runtime = 'native' AND closed_at IS NULL`);
	});
	for (const run of runs) await stopNative(ctx, run);
	const client = await ensureNativeRuntime(ctx.home);
	await client.shutdown();
	return { stopped: runs.length };
};
