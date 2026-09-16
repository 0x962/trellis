import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import { taskKey } from "../../agents/nativeFlow/taskKey.ts";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import { rows } from "../../db/queries/support.ts";
import { closeExitedAssignments } from "../agentRuns/closeExitedAssignments.ts";
import { stopNative } from "../agentRuns/nativeLifecycle.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { getRun, type StoredRun } from "../agentRuns/queries.ts";
import { readNativeHarness } from "../agentRuns/readNativeHarness.ts";
import { claimNext } from "./claimNext.ts";
import { drainFlowStops } from "./drainFlowStops.ts";
import { readExecution } from "./queries.ts";
import { recordFlowFailure } from "./recordFlowFailure.ts";
import { recordTaskObservation } from "./recordTaskObservation.ts";
import type { FlowCtx } from "./types.ts";

type Claim = NonNullable<Awaited<ReturnType<typeof claimNext>>>;
type Dependencies = {
	start: (ctx: FlowCtx, claim: Claim) => Promise<unknown>;
	observe: (ctx: FlowCtx, run: StoredRun) => Promise<HarnessSnapshot | null>;
	stop: (ctx: FlowCtx, run: StoredRun) => Promise<unknown>;
};
const defaults: Dependencies = { start: startNative, observe: readNativeHarness, stop: stopNative };
const active = new Map<string, Promise<{ observed: number; launched: number; errors: string[] }>>();
async function reconcile(ctx: FlowCtx, deps: Dependencies) {
	const sessions = await closeExitedAssignments(ctx);
	const executions = await ctx.newTx((tx) =>
		rows<{ id: string }>(
			tx,
			sql`SELECT id FROM flow_executions e WHERE e.state->>'status' IN ('running','waiting') OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.state->'steps') s WHERE s->>'needsStop'='true') OR EXISTS (SELECT 1 FROM flow_execution_tasks t JOIN agent_runs r ON r.id=t.run_id WHERE t.execution_id=e.id AND (t.result_id IS NOT NULL OR e.state->>'status'='failed') AND r.closed_at IS NULL) ORDER BY created_at,id`,
		),
	);
	let launched = 0;
	const errors: string[] = [];
	for (const execution of executions) {
		const tasks = await ctx.newTx((tx) =>
			rows<{ key: string; run_id: string; attempt_id: string }>(
				tx,
				sql`SELECT key,run_id,attempt_id FROM flow_execution_tasks WHERE execution_id=${execution.id} AND result_id IS NULL`,
			),
		);
		for (const task of tasks) {
			const run = await ctx.newTx((tx) => getRun(tx, task.run_id));
			let snapshot: HarnessSnapshot | null;
			try {
				snapshot = await deps.observe(ctx, run);
			} catch (cause) {
				const error = cause instanceof Error ? cause.message : String(cause);
				errors.push(error);
				snapshot = { state: "unknown", sessionId: run.sessionId, result: null, acknowledgedMessageIds: [], error };
			}
			if (snapshot !== null)
				await ctx.newTx((tx) =>
					recordTaskObservation(ctx.core, tx, {
						id: execution.id,
						key: task.key,
						attemptId: task.attempt_id,
						snapshot,
					}),
				);
		}
		const stopErrors = await drainFlowStops(ctx, execution.id, deps.stop);
		errors.push(...stopErrors);
		if (stopErrors.length > 0) continue;
		const claims: Claim[] = [];
		let claimFailed = false;
		while (true) {
			let claim: Claim | null;
			try {
				claim = await ctx.newTx((tx) => claimNext(ctx.core, tx, { id: execution.id, sessions }));
			} catch (cause) {
				if (!(cause instanceof ORPCError)) throw cause;
				const data = cause.data as { issues?: { message: string }[] } | undefined;
				const error = data?.issues?.map((issue) => issue.message).join("\n") ?? cause.message;
				errors.push(error);
				await ctx.newTx((tx) => recordFlowFailure(ctx.core, tx, { id: execution.id, error }));
				claimFailed = true;
				break;
			}
			if (claim === null) break;
			claims.push(claim);
		}
		if (claimFailed) {
			errors.push(...(await drainFlowStops(ctx, execution.id, deps.stop)));
			continue;
		}
		const outcomes = await Promise.allSettled(
			claims.map(async (claim) => {
				const current = await ctx.newTx((tx) => readExecution(tx, claim.id));
				if (current.state.steps.find((step) => taskKey(step) === claim.key)?.state !== "running") return;
				await deps.start(ctx, claim);
			}),
		);
		for (const [index, result] of outcomes.entries())
			if (result.status === "rejected") {
				const claim = claims[index]!;
				const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
				errors.push(error);
				await ctx.newTx((tx) =>
					recordTaskObservation(ctx.core, tx, {
						id: claim.id,
						key: claim.key,
						attemptId: claim.attempt.id,
						snapshot: {
							state: "unknown",
							sessionId: claim.run.sessionId!,
							result: null,
							error,
							acknowledgedMessageIds: [],
						},
					}),
				);
			}
		launched += claims.length;
	}
	return { observed: executions.length, launched, errors };
}
export function prepareFlowReconcile(ctx: FlowCtx, _input: Record<string, never> = {}, deps: Dependencies = defaults) {
	const current = active.get(ctx.home);
	if (current) return current;
	const work = reconcile(ctx, deps).finally(() => active.delete(ctx.home));
	active.set(ctx.home, work);
	return work;
}
