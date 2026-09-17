import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { Tx } from "../../db/tx.ts";
import { readNativeWork } from "../agentRuns/nativeControl.ts";
import { dispatchChat } from "../chat/dispatch.ts";
import { dispatchMentions } from "../commentMentions/dispatch.ts";
import { manage } from "../manager/manager.ts";
import type { IoCtx } from "../support.ts";

type Dependencies = {
	readSessions: (home: string) => Promise<RuntimeProcessStatus[]>;
	manage: typeof manage;
	mentions: typeof dispatchMentions;
	chat: typeof dispatchChat;
};
const defaults: Dependencies = {
	readSessions: async (home) => nativeHost(home, undefined, await ensureNativeRuntime(home)).list(),
	manage,
	mentions: dispatchMentions,
	chat: dispatchChat,
};
export const dispatch = async (ctx: IoCtx, _input: Record<string, never> = {}, deps: Dependencies = defaults) => {
	if ((await ctx.newTx(readNativeWork)).paused) return {};
	const sessions = await deps.readSessions(ctx.home);
	const results = await Promise.allSettled([
		deps.manage(ctx, { sessions }),
		deps.mentions(ctx, sessions),
		deps.chat(ctx, sessions),
	]);
	const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
	if (errors.length) throw new AggregateError(errors, errors.map((error) => String(error)).join("\n"));
	return {};
};
export const finished = (_ctx: IoCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
