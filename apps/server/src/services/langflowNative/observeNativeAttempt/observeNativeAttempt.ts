import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { nativeClient } from "../../../agents/native/connection";
import type { Tx } from "../../../db/tx";
import { getRun } from "../../agentRuns/queries";
import type { IoCtx } from "../../support";
import { readReservation } from "../readReservation";
import { recordNativeObservation } from "../recordNativeObservation";

const exec = promisify(execFile);
type ObservationCtx = Parameters<typeof recordNativeObservation>[0];

export async function observeNativeAttempt(
	ctx: IoCtx & Pick<ObservationCtx, "recordWorkspace">,
	input: { executionId: string; stepId: string },
) {
	const reserved = await ctx.newTx((tx: Tx) => readReservation(tx, input));
	const runtime = await nativeClient(ctx.home).inspect(reserved.attemptId);
	const run = await ctx.newTx((tx: Tx) => getRun(tx, reserved.agentRunId));
	if (run.terminalId !== reserved.attemptId) throw new Error("native_attempt_conflict");
	let workspaceCommit: string | null = null;
	if (run.workspaceId !== null) {
		// A missing Git revision stays unknown in the execution view.
		const revision = await exec("git", ["-C", run.workspaceId, "rev-parse", "--verify", "HEAD"]).then(
			(value) => value.stdout.trim(),
			() => null,
		);
		workspaceCommit = revision;
	}
	return ctx.newTx((tx: Tx) =>
		recordNativeObservation({ ...ctx.core, now: ctx.now(), recordWorkspace: ctx.recordWorkspace }, tx, {
			...input,
			runtime,
			workspaceCommit,
		}),
	);
}
