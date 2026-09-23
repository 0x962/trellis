import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { dispatchDeliveries } from "./dispatchDeliveries.ts";

export async function prepare(ctx: IoCtx) {
	// Only a session whose process runs takes a message, and a message whose
	// session this answer leaves out waits for the next beat of this step.
	const answer = await nativeHost(ctx.home, undefined, await ensureNativeRuntime(ctx.home)).list({ status: "running" });
	await dispatchDeliveries(ctx, answer.sessions);
	return {};
}

export const finish = (_ctx: IoCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
