import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { Tx } from "../../db/tx.ts";
import { hostIsShuttingDown } from "../agentRuns/hostShutdown.ts";
import { dispatchChat } from "../chat/dispatch.ts";
import { dispatchMentions } from "../commentMentions/dispatch.ts";
import { loopRuntimes } from "../loops/runtime.ts";
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
export const dispatch = async (ctx: IoCtx, input: { manage?: boolean } = {}, deps: Dependencies = defaults) => {
	if (hostIsShuttingDown(ctx.home)) return {};
	const loop = loopRuntimes.get(ctx.home);
	loop?.report("Read runtime");
	const sessions = await deps.readSessions(ctx.home);
	loop?.report("Check assignments and deliver messages", `Read ${sessions.length} runtime processes.`);
	const results = await Promise.allSettled([
		input.manage === false ? Promise.resolve() : deps.manage(ctx, { sessions }),
		deps.mentions(ctx, sessions),
		deps.chat(ctx, sessions),
	]);
	const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
	if (errors.length) throw new AggregateError(errors, errors.map((error) => String(error)).join("\n"));
	return {};
};
export const finished = (_ctx: IoCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
