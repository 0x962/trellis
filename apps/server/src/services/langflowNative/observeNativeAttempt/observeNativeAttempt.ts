import { nativeClient } from "../../../agents/native/connection";
import type { Tx } from "../../../db/tx";
import { getRun } from "../../agentRuns";
import type { IoCtx } from "../../support";
import { readReservation } from "../readReservation";
import { recordNativeLaunch } from "../recordNativeLaunch";
import { recordNativeObservation } from "../recordNativeObservation";
import { workspaceCommit } from "./components/workspaceCommit";

type ObservationCtx = Parameters<typeof recordNativeObservation>[0];

export async function observeNativeAttempt(
	ctx: IoCtx & Pick<ObservationCtx, "recordWorkspace">,
	input: { executionId: string; stepId: string },
	client: Pick<ReturnType<typeof nativeClient>, "inspect"> = nativeClient(ctx.home),
) {
	const reserved = await ctx.newTx((tx: Tx) => readReservation(tx, input));
	const runtime = await client.inspect(reserved.attemptId);
	const run = await ctx.newTx((tx: Tx) => getRun(tx, reserved.agentRunId));
	if (run.terminalId !== reserved.attemptId) throw new Error("native_attempt_conflict");
	const commit = run.workspaceId === null ? null : await workspaceCommit(run.workspaceId);
	const result = await ctx.newTx(async (tx: Tx) => {
		const observed = await recordNativeObservation(
			{ ...ctx.core, now: ctx.now(), recordWorkspace: ctx.recordWorkspace },
			tx,
			{
				...input,
				runtime,
				workspaceCommit: commit,
			},
		);
		if (runtime.status !== "unknown" && runtime.pid !== null)
			await recordNativeLaunch({ ...ctx.core, now: ctx.now() }, tx, {
				...input,
				attemptId: reserved.attemptId,
				launchedAt: runtime.startedAt,
			});
		return observed;
	});
	if (result.reason !== null)
		ctx.log("native observation incomplete", { ...input, attemptId: reserved.attemptId, reason: result.reason });
	return result;
}
