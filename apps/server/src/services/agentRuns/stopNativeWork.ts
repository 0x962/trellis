import { sql } from "drizzle-orm";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { invalidInput } from "../../errors.ts";
import type { ServiceCtx } from "../support.ts";
import { beginHostShutdown } from "./hostShutdown.ts";
import { stopNative } from "./nativeLifecycle.ts";
import { listColumns, type StoredRun, storedRows } from "./queries.ts";

export const stopNativeWork = async (ctx: ServiceCtx & { core: CoreCtx }) => {
	if (ctx.core.actor?.kind !== "human") throw invalidInput("actor", "A person must quit Trellis completely.");
	beginHostShutdown(ctx.home);
	const runs = await ctx.newTx((tx) =>
		storedRows<StoredRun>(
			tx,
			sql`SELECT ${listColumns} FROM agent_runs WHERE runtime = 'native' AND closed_at IS NULL`,
		),
	);
	for (const run of runs) await stopNative(ctx, run);
	const client = await ensureNativeRuntime(ctx.home);
	await client.shutdown();
	return { stopped: runs.length };
};
