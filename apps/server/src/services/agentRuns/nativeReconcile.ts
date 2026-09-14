import { isDeepStrictEqual } from "node:util";
import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import { rows } from "../../db/queries/support.ts";
import type { ServiceCtx } from "../support.ts";
import { getNativeObservation } from "./getNativeObservation.ts";
import { refreshNative } from "./nativeLifecycle.ts";
import { columns } from "./queries.ts";
import { readNativeHarness } from "./readNativeHarness.ts";
import { reconcileNativeObservation } from "./reconcileNativeObservation.ts";

export { getNativeObservation, reconcileNativeObservation };

type Dependencies = {
	refresh: (ctx: ServiceCtx, run: AgentRun) => Promise<unknown>;
	observe: (ctx: ServiceCtx, run: AgentRun) => Promise<HarnessSnapshot | null>;
};
const dependencies: Dependencies = { refresh: refreshNative, observe: readNativeHarness };
export const prepareNativeReconcile = async (
	ctx: ServiceCtx,
	_input: Record<string, never> = {},
	deps: Dependencies = dependencies,
) => {
	const runs = await ctx.newTx((tx) =>
		rows<AgentRun>(
			tx,
			sql`SELECT ${columns} FROM agent_runs WHERE runtime='native' AND terminal_id IS NOT NULL AND (state IN ('running','interrupted') OR (state IN ('exited','failed','stopped') AND EXISTS (SELECT 1 FROM agent_harness_observations o WHERE o.attempt_id=agent_runs.terminal_id AND o.checkpoint->>'processExited' IS DISTINCT FROM 'true')))`,
		),
	);
	let changed = 0;
	for (const run of runs) {
		const previous = await ctx.newTx((tx) => getNativeObservation(tx, run.terminalId!));
		await deps.refresh(ctx, run);
		let snapshot: HarnessSnapshot | null;
		try {
			snapshot = await deps.observe(ctx, run);
		} catch (error) {
			const previous = await ctx.newTx((tx) => getNativeObservation(tx, run.terminalId!));
			snapshot = {
				...(previous ?? {
					sessionId: run.sessionId ?? "",
					acknowledgedMessageIds: [],
					pendingPermissions: [],
					result: null,
					transcript: [],
				}),
				state: "unknown",
				error: error instanceof Error ? error.message : String(error),
			};
		}
		if (deps === dependencies) {
			if (!isDeepStrictEqual(previous, snapshot)) changed++;
			continue;
		}
		if (
			snapshot !== null &&
			(await ctx.newTx((tx) =>
				reconcileNativeObservation(ctx, tx, { runId: run.id, attemptId: run.terminalId!, snapshot }),
			))
		)
			changed++;
	}
	return { observed: runs.length, changed };
};
