import { isDeepStrictEqual } from "node:util";
import type { DeliveryAuthorityV1 } from "../../../langflowContracts";
import {
	createNativeDispatchGate,
	type NativeVisit,
	recordNativeLaunch,
	requestNativeAttempt,
	resolveNativeLimits,
	resolveNativeOccurrence,
} from "../../langflowNative";
import type { IoCtx } from "../../support";
import { actionControl } from "../actionControl";
import { nativeAuthority, type NativeAuthorityInput } from "../nativeAuthority";

export type NativeReservationInput = NativeAuthorityInput & {
	authority: DeliveryAuthorityV1;
	visit: NativeVisit;
};

export async function prepareNativeReservation(ctx: IoCtx, input: NativeReservationInput) {
	const authority = await ctx.newTx((tx) => nativeAuthority(ctx, tx, input));
	if (!isDeepStrictEqual(authority, input.authority)) throw new Error("native_authority_conflict");
	const control = actionControl(ctx.home);
	const dispatchGate = createNativeDispatchGate({
		newTx: ctx.newTx,
		dataHomeId: control.identity.dataHomeId,
		gate: control.gate,
		archive: control.archive,
	});
	const handle = await requestNativeAttempt({
		...ctx,
		dispatchGate,
		nativeAuthority: authority,
		resolveOccurrence: (tx, request) => resolveNativeOccurrence(
			{ ...ctx.core, now: ctx.now(), nativeAuthority: authority }, tx,
			{ requestBytes: request.requestBytes, visit: input.visit },
		),
		resolveProcessLimits: (tx, request) => resolveNativeLimits(ctx.core, tx, request),
		recordObservedLaunch: (tx, request) => recordNativeLaunch(ctx.core, tx, request),
	}, { requestBytes: input.requestBytes });
	return JSON.stringify(handle);
}
