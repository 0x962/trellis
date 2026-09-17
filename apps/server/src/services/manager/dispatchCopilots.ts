import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import { hostIsShuttingDown } from "../agentRuns/hostShutdown.ts";
import { loopRuntimes } from "../loops/runtime.ts";
import type { IoCtx } from "../support.ts";
import { reconcileCopilot } from "./copilot.ts";

const active = new Map<string, Promise<unknown>>();

export async function dispatchCopilots(ctx: IoCtx, sessions: RuntimeProcessStatus[]) {
	if (hostIsShuttingDown(ctx.home)) return;
	const loop = loopRuntimes.get(ctx.home);
	loop?.report("Read project agents");
	const projects = await ctx.newTx((tx) =>
		rows<{ id: string }>(
			tx,
			sql`SELECT p.id FROM projects p WHERE NOT EXISTS (
		WITH RECURSIVE ancestors AS (SELECT id,parent_id,archived_at FROM projects WHERE id=p.id
		UNION ALL SELECT parent.id,parent.parent_id,parent.archived_at FROM projects parent JOIN ancestors a ON parent.id=a.parent_id)
		SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL)`,
		),
	);
	let completed = 0;
	loop?.report(`Check copilots (0/${projects.length})`);
	const work = projects.map((project) => {
		const key = `${ctx.home}:copilot:${project.id}`;
		if (active.has(key)) return active.get(key)!;
		const promise = reconcileCopilot(ctx, project.id, sessions)
			.catch((error: unknown) => {
				loop?.record(`copilot:${project.id}: ${error instanceof Error ? error.message : String(error)}`, "error");
				throw error;
			})
			.finally(() => {
				active.delete(key);
				loop?.report(`Check copilots (${++completed}/${projects.length})`);
			});
		active.set(key, promise);
		return promise;
	});
	const results = await Promise.allSettled(work);
	loop?.report("Finish pass", `Checked ${projects.length} project copilots.`);
	const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
	if (errors.length) throw new AggregateError(errors, errors.map((error) => String(error)).join("\n"));
}
