import { dispatchNative } from "../dispatchNative";
import { readReservation } from "../readReservation";
import { reserveNativeRequest } from "../reserveNativeRequest";
import type { NativeReservationCtx } from "../types";

type Context = Parameters<typeof dispatchNative>[0] & Pick<NativeReservationCtx, "resolveOccurrence">;

export async function requestNativeAttempt(
	ctx: Context,
	input: { requestBytes: string },
	deps: Parameters<typeof dispatchNative>[2] = {},
) {
	const reserved = await ctx.newTx((tx) =>
		reserveNativeRequest(
			{
				...ctx.core,
				now: ctx.now(),
				home: ctx.home,
				dispatchGate: ctx.dispatchGate,
				nativeAuthority: ctx.nativeAuthority,
				resolveOccurrence: ctx.resolveOccurrence,
			},
			tx,
			input,
		),
	);
	if (reserved.replay) return reserved.reservation.handle;
	await ctx.dispatchGate.settle(reserved.permit, reserved.reservation.stepId);
	await dispatchNative(ctx, reserved, deps);
	return (
		await ctx.newTx((tx) =>
			readReservation(tx, {
				executionId: reserved.reservation.executionId,
				stepId: reserved.reservation.stepId,
			}),
		)
	).handle;
}
