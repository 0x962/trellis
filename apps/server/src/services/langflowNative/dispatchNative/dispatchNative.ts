import { assertAuthority, lockExecution } from "../../../db/queries/langflowExecution/executions";
import { updateNativeHandle } from "../../../db/queries/langflowExecution/native";
import type { Tx } from "../../../db/tx";
import type { DeliveryAuthorityV1 } from "../../../langflowContracts";
import { startNative } from "../../agentRuns/nativeStart";
import type { IoCtx } from "../../support";
import { readReservation } from "../readReservation";
import type { reserveNativeRequest } from "../reserveNativeRequest";

type Reserved = Extract<Awaited<ReturnType<typeof reserveNativeRequest>>, { replay: false }>;
type DispatchCtx = IoCtx & {
	nativeAuthority: DeliveryAuthorityV1;
	resolveProcessLimits: (
		tx: Tx,
		input: { executionId: string; stepId: string; attemptId: string },
	) => Promise<{ deadlineAt?: number; budgetMs?: number }>;
	recordObservedLaunch: (
		tx: Tx,
		input: { executionId: string; stepId: string; attemptId: string; launchedAt: string },
	) => Promise<void>;
};

export async function dispatchNative(ctx: DispatchCtx, reserved: Reserved) {
	const input = { executionId: reserved.reservation.executionId, stepId: reserved.reservation.stepId };
	const claimed = await ctx.newTx(async (tx: Tx) => {
		const execution = await lockExecution(tx, input);
		assertAuthority(execution, ctx.nativeAuthority, "native.reserve", ctx.now());
		if (execution.cancelIntent || execution.admission.state !== "open") throw new Error("admission_closed");
		const current = await readReservation(tx, input);
		if (
			current.agentRunId !== reserved.launch.run.id ||
			current.attemptId !== reserved.launch.attempt.id ||
			current.requestBytes !== reserved.reservation.requestBytes
		)
			throw new Error("native_attempt_conflict");
		if (current.handle.state !== "reserved") return null;
		const deadline = current.provenance.request.deadlineAt;
		if (deadline !== null && Date.parse(deadline) <= ctx.now().getTime()) throw new Error("native_deadline_elapsed");
		const limits = await ctx.resolveProcessLimits(tx, { ...input, attemptId: current.attemptId });
		await updateNativeHandle(tx, {
			executionId: input.executionId,
			expectedRevision: current.handle.revision,
			handle: { ...current.handle, state: "launching", revision: current.handle.revision + 1 },
		});
		return limits;
	});
	if (claimed === null) return { launched: false };
	const result = await startNative(ctx, {
		...reserved.launch,
		...claimed,
		preserveAssignmentOnFailure: true,
	});
	if (result.launchedAt !== undefined)
		await ctx.newTx((tx: Tx) =>
			ctx.recordObservedLaunch(tx, {
				...input,
				attemptId: reserved.launch.attempt.id,
				launchedAt: result.launchedAt!,
			}),
		);
	return { launched: result.launchedAt !== undefined };
}
