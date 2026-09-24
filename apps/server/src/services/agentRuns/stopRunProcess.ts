import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { invalidInput } from "../../errors.ts";
import type { IoCtx, ServiceCtx } from "../support.ts";
import type { stopNative } from "./nativeLifecycle.ts";
import type { StoredRun } from "./queries.ts";

// `process` reads the runtime record of one terminal id. `stop` ends the
// process of a run. The caller passes both, so a test drives this function
// with no runtime.
export type StopRunDeps = {
	process: (ctx: Pick<ServiceCtx, "home">, terminalId: string | null) => Promise<RuntimeProcessStatus | null>;
	stop: typeof stopNative;
};

// Ends the agent of a run and leaves the run closed. A closed run holds no
// assignment, so trellis opens no process for it until a person starts it
// again.
//
// The runtime answers `null` when it holds no record of `run.terminalId`. An
// open run whose terminal id the runtime cannot find may still hold a process
// that writes in the workspace, so the call stops and a person inspects the
// agent. A process that exited for `idle` keeps its runtime record, and the
// runtime removes that record when it stops the process.
//
// The `terminal_id` condition of the UPDATE holds the close to the attempt
// this call read. A launch that replaced the attempt in the meantime keeps
// its open run.
export const stopRunProcess = async (ctx: IoCtx, run: StoredRun, deps: StopRunDeps) => {
	const previous = await deps.process(ctx, run.terminalId);
	if (previous === null && run.terminalId !== null && run.closedAt === null)
		throw invalidInput("id", "The prior launch is not confirmed. Inspect the agent first.");
	if (previous !== null && (previous.status !== "exited" || previous.stopReason === "idle")) await deps.stop(ctx, run);
	else if (run.closedAt === null)
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET closed_at = ${ctx.now()}, updated_at = ${ctx.now()}
					WHERE id = ${run.id} AND terminal_id IS NOT DISTINCT FROM ${run.terminalId}`,
			),
		);
};
