import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { dispatchMentions } from "./dispatch.ts";

export async function prepare(ctx: IoCtx) {
	const sessions = await nativeHost(ctx.home, undefined, await ensureNativeRuntime(ctx.home)).list();
	await dispatchMentions(ctx, sessions);
	return {};
}

export const finish = (_ctx: IoCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
