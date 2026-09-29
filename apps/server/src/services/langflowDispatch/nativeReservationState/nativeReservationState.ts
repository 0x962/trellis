import type { Tx } from "../../../db/tx";
import { readNativeRequest } from "../../langflowNative";
import type { IoCtx } from "../../support";
import { type NativeAuthorityInput, nativeAuthority } from "../nativeAuthority";

export async function nativeReservationState(ctx: IoCtx, tx: Tx, input: NativeAuthorityInput) {
	const authority = await nativeAuthority(ctx, tx, input);
	const request = await readNativeRequest({ now: ctx.now(), nativeAuthority: authority }, tx, input);
	return { authority, request };
}
