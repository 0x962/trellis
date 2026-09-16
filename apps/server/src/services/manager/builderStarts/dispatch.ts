import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import { startNative } from "../../agentRuns/nativeStart.ts";
import { getRun } from "../../agentRuns/queries.ts";
import type { IoCtx } from "../../support.ts";
import { claimBuilderStart } from "./claim.ts";
import { collectBuilderStarts } from "./collect.ts";
import { recoverBuilderStart } from "./recover.ts";

const active = new Map<string, Promise<void>>();

async function dispatch(ctx: IoCtx, start: typeof startNative, sessions: RuntimeProcessStatus[]) {
	await ctx.newTx((tx) => collectBuilderStarts(ctx.core, tx, sessions));
	const pending = await ctx.newTx((tx) =>
		rows<{ id: string; state: string; run_id: string | null }>(
			tx,
			sql`
		SELECT r.id,r.state,r.run_id FROM builder_start_requests r JOIN tickets t ON t.id=r.ticket_id
		WHERE r.state IN ('pending','launching') AND NOT EXISTS (
			WITH RECURSIVE ancestors AS (
				SELECT id,parent_id,archived_at,manager_config FROM projects WHERE id=t.project_id
				UNION ALL SELECT p.id,p.parent_id,p.archived_at,p.manager_config FROM projects p JOIN ancestors a ON p.id=a.parent_id
			) SELECT id FROM ancestors WHERE archived_at IS NOT NULL
		) AND NOT EXISTS (SELECT 1 FROM settings WHERE key='nativeWorkPaused' AND value='true'::jsonb)
		ORDER BY r.created_at,r.id LIMIT 20`,
		),
	);
	const outcomes = await Promise.allSettled(
		pending.map(async (request) => {
			if (request.state === "launching") {
				await recoverBuilderStart(ctx, { id: request.id, run_id: request.run_id! });
			} else {
				const claim = await ctx.newTx((tx) => claimBuilderStart(ctx.core, tx, request.id));
				if (!claim) return;
				request.run_id = claim.run.id;
				ctx.emit({ type: "agent-runs.changed", id: claim.run.id });
				await start(ctx, { ...claim, requiredTicketCategory: "started" });
			}
			const run = await ctx.newTx((tx) => getRun(tx, request.run_id!));
			await ctx.newTx((tx) =>
				tx.execute(
					sql`UPDATE builder_start_requests SET state=${run.error ? "failed" : "assigned"},error=${run.error},retry_at=${run.error ? new Date(ctx.core.now.getTime() + 120_000) : null} WHERE id=${request.id} AND state='launching'`,
				),
			);
			ctx.emit({ type: "agent-runs.changed", id: run.id });
		}),
	);
	for (const [index, outcome] of outcomes.entries()) {
		if (outcome.status !== "rejected") continue;
		const request = pending[index]!;
		const error = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
		await ctx.newTx(async (tx) => {
			await tx.execute(
				sql`UPDATE builder_start_requests SET state='failed',error=${error},retry_at=${new Date(ctx.core.now.getTime() + 120_000)} WHERE id=${request.id}`,
			);
			if (request.run_id)
				await tx.execute(sql`UPDATE agent_runs SET error=${error} WHERE id=${request.run_id} AND closed_at IS NULL`);
		});
		if (request.run_id) ctx.emit({ type: "agent-runs.changed", id: request.run_id });
	}
}

export function dispatchBuilderStarts(ctx: IoCtx, start = startNative, sessions: RuntimeProcessStatus[] = []) {
	const current = active.get(ctx.home);
	if (current) return current;
	const work = dispatch(ctx, start, sessions).finally(() => active.delete(ctx.home));
	active.set(ctx.home, work);
	return work;
}
