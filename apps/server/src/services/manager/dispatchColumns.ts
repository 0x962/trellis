import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import { hostIsShuttingDown } from "../agentRuns/hostShutdown.ts";
import { loopRuntimes } from "../loops/runtime.ts";
import type { IoCtx } from "../support.ts";
import { columnStates } from "./columnState.ts";
import { reconcileCopilot } from "./copilot.ts";
import { reconcileColumn } from "./reconcileColumn.ts";

const active = new Map<string, Promise<unknown>>();
const defaults = { column: reconcileColumn, copilot: reconcileCopilot };

export async function dispatchColumns(ctx: IoCtx, sessions: RuntimeProcessStatus[], deps = defaults) {
	if (hostIsShuttingDown(ctx.home)) return;
	const loop = loopRuntimes.get(ctx.home);
	loop?.report("Read ticket and project assignments");
	const columns = await ctx.newTx((tx) => columnStates(tx));
	const projects = await ctx.newTx((tx) =>
		rows<{ id: string }>(
			tx,
			sql`SELECT p.id FROM projects p WHERE NOT EXISTS (
		WITH RECURSIVE ancestors AS (SELECT id,parent_id,archived_at FROM projects WHERE id=p.id
		UNION ALL SELECT parent.id,parent.parent_id,parent.archived_at FROM projects parent JOIN ancestors a ON parent.id=a.parent_id)
		SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL)`,
		),
	);
	const jobs = [
		...columns.map((state) => ({ key: `ticket:${state.ticketId}`, run: () => deps.column(ctx, state, sessions) })),
		...projects.map((project) => ({
			key: `copilot:${project.id}`,
			run: () => deps.copilot(ctx, project.id, sessions),
		})),
	];
	let completed = 0;
	loop?.report(`Check workers and copilots (0/${jobs.length})`);
	const work = jobs.map((job) => {
		const key = `${ctx.home}:${job.key}`;
		if (active.has(key)) return active.get(key)!;
		const promise = job
			.run()
			.catch((error: unknown) => {
				loop?.record(`${job.key}: ${error instanceof Error ? error.message : String(error)}`, "error");
				throw error;
			})
			.finally(() => {
				active.delete(key);
				loop?.report(`Check workers and copilots (${++completed}/${jobs.length})`);
			});
		active.set(key, promise);
		return promise;
	});
	const results = await Promise.allSettled(work);
	loop?.report("Finish pass", `Checked ${columns.length} ticket assignments and ${projects.length} project copilots.`);
	const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
	if (errors.length) throw new AggregateError(errors, errors.map((error) => String(error)).join("\n"));
}
