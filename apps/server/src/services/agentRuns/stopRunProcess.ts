import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import type { IoCtx, ServiceCtx } from "../support.ts";
import { attemptStopped } from "./attemptCapture.ts";
import type { stopNative } from "./nativeLifecycle.ts";
import type { StoredRun } from "./queries.ts";

// `process` reads the runtime record of one terminal id. `stop` ends the
// process of a run. The caller passes both, so a test drives this function
// with no runtime.
export type StopRunDeps = {
	process: (ctx: Pick<ServiceCtx, "home">, terminalId: string | null) => Promise<RuntimeProcessStatus | null>;
	stop: typeof stopNative;
};

// A stop reconciles an absent runtime record before it releases the assignment.
// The terminal condition keeps the update on the attempt this call read.
export const stopRunProcess = async (ctx: IoCtx, run: StoredRun, deps: StopRunDeps) => {
	const previous = await deps.process(ctx, run.terminalId);
	if (
		run.terminalId !== null &&
		((previous === null && !(await attemptStopped(ctx.home, run.id, run.terminalId))) ||
			(previous !== null && (previous.status !== "exited" || previous.stopReason === "idle")))
	)
		await deps.stop(ctx, run);
	else if (run.closedAt === null)
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET closed_at = ${ctx.now()}, updated_at = ${ctx.now()}
					WHERE id = ${run.id} AND terminal_id IS NOT DISTINCT FROM ${run.terminalId}`,
			),
		);
};
