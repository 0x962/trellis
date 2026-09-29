import { lockExecution } from "../../../../db/queries/langflowExecution";
import { withAttemptOperation } from "../../../langflowStops/withAttemptOperation";
import type { IoCtx } from "../../../support";
import { observeNativeAttempt } from "../../observeNativeAttempt";
import { readReservation } from "../../readReservation";
import { recordNativeLaunch } from "../../recordNativeLaunch";
import { recoverNativeAttempt } from "../../recoverNativeAttempt";
import { resolveNativeLimits } from "../../resolveNativeLimits";
import type { HostKey, NativeKey, RuntimeWorkerDependencies } from "../contracts";

export function createNativeRuntimeWorker(deps: RuntimeWorkerDependencies) {
	async function read(ctx: IoCtx, input: HostKey & NativeKey) {
		if (ctx.actor.kind !== "system") throw new Error("langflow_internal_native_required");
		return ctx.newTx(async (tx) => {
			const execution = await lockExecution(tx, input);
			if (execution.hostId !== input.hostId) throw new Error("native_host_conflict");
			return { execution, reservation: await readReservation(tx, input) };
		});
	}
	return {
		async observe(ctx: IoCtx, input: HostKey & NativeKey) {
			const { reservation } = await read(ctx, input);
			await withAttemptOperation(ctx.home, reservation.attemptId, () =>
				observeNativeAttempt(
					{
						...ctx,
						recordWorkspace: (tx, observation) =>
							deps.recordWorkspace({ ...ctx.core, now: ctx.now() }, tx, observation),
					},
					input,
				),
			);
			return null;
		},
		async recover(ctx: IoCtx, input: HostKey & NativeKey) {
			const { execution, reservation } = await read(ctx, input);
			if (
				reservation.handle.state !== "reserved" ||
				execution.cancelIntent !== null ||
				execution.admission.state !== "open" ||
				execution.authority === null
			)
				return null;
			await recoverNativeAttempt(
				{
					...ctx,
					nativeAuthority: execution.authority,
					dispatchGate: await deps.dispatchGate(ctx),
					resolveProcessLimits: (tx, limits) => resolveNativeLimits({ ...ctx.core, now: ctx.now() }, tx, limits),
					recordObservedLaunch: (tx, launch) => recordNativeLaunch({ ...ctx.core, now: ctx.now() }, tx, launch),
				},
				input,
			);
			return null;
		},
	};
}
