import { assertAuthority, lockExecution } from "../../../db/queries/langflowExecution/executions";
import { updateNativeHandle } from "../../../db/queries/langflowExecution/native";
import type { Tx } from "../../../db/tx";
import type { DeliveryAuthorityV1 } from "../../../langflowContracts";
import type { DispatchGate } from "../../../langflowHost";
import { startNative } from "../../agentRuns";
import { withAttemptOperation } from "../../langflowStops/withAttemptOperation";
import type { IoCtx } from "../../support";
import { nativePromptGuide } from "../nativePromptGuide";
import { readReservation } from "../readReservation";
import type { reserveNativeRequest } from "../reserveNativeRequest";

type Reserved = Pick<
	Extract<Awaited<ReturnType<typeof reserveNativeRequest>>, { replay: false }>,
	"reservation" | "launch"
>;
type DispatchCtx = IoCtx & {
	dispatchGate: Pick<DispatchGate, "acquire" | "settle">;
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

export async function dispatchNative(
	ctx: DispatchCtx,
	reserved: Reserved,
	deps: Parameters<typeof startNative>[2] = {},
) {
	const input = { executionId: reserved.reservation.executionId, stepId: reserved.reservation.stepId };
	const claimed = await ctx.newTx(async (tx: Tx) => {
		const execution = await lockExecution(tx, input);
		await assertAuthority(tx, execution, ctx.nativeAuthority, "native.reserve", ctx.now());
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
		const permit = ctx.dispatchGate.acquire({
			effectId: `native-launch:${current.stepId}:${current.attemptId}`,
			kind: "native-dispatch",
			executionId: input.executionId,
			attemptId: current.attemptId,
			jobId: current.provenance.request.engineJobId,
			requestId: current.requestId,
			payloadDigest: current.requestDigest,
		});
		await updateNativeHandle(tx, {
			executionId: input.executionId,
			expectedRevision: current.handle.revision,
			handle: { ...current.handle, state: "launching", revision: current.handle.revision + 1 },
		});
		return { limits, permit };
	});
	if (claimed === null) return { launched: false };
	const result = await startNative(
		ctx,
		{
			...reserved.launch,
			...claimed.limits,
			withLaunchOperation: (action) => withAttemptOperation(ctx.home, reserved.launch.attempt.id, action),
			preserveAssignmentOnFailure: true,
			authorizeLaunch: () =>
				ctx.newTx(async (tx: Tx) => {
					const current = await lockExecution(tx, input);
					await assertAuthority(tx, current, ctx.nativeAuthority, "native.reserve", ctx.now());
					return current.cancelIntent === null && current.admission.state === "open";
				}),
		},
		{ ...deps, guide: nativePromptGuide(claimed.limits, deps.guide) },
	);
	if (result.launchedAt !== undefined)
		await ctx.newTx((tx: Tx) =>
			ctx.recordObservedLaunch(tx, {
				...input,
				attemptId: reserved.launch.attempt.id,
				launchedAt: result.launchedAt!,
			}),
		);
	if (result.launchedAt !== undefined) {
		const saved = await ctx.newTx((tx: Tx) => readReservation(tx, input));
		if (saved.launchReceipt === null) throw new Error("native_launch_receipt_missing");
		await ctx.dispatchGate.settle(claimed.permit, saved.launchReceipt.launchReceiptId);
	}
	return { launched: result.launchedAt !== undefined };
}
