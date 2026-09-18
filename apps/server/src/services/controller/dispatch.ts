import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { Tx } from "../../db/tx.ts";
import { hostIsShuttingDown } from "../agentRuns/hostShutdown.ts";
import { readRunningAssignments } from "../agentRuns/readRunningAssignments";
import { dispatchMentions } from "../commentMentions/dispatch.ts";
import { loopRuntimes } from "../loops/runtime.ts";
import { manage } from "../manager/manager.ts";
import type { IoCtx } from "../support.ts";

type Dependencies = {
	readSessions: (ctx: IoCtx) => Promise<RuntimeProcessStatus[]>;
	manage: typeof manage;
	mentions: typeof dispatchMentions;
};
const defaults: Dependencies = {
	readSessions: async (ctx) => {
		const runtime = await ensureNativeRuntime(ctx.home);
		return readRunningAssignments(ctx, (home, input) => nativeHost(home, undefined, runtime).list(input));
	},
	manage,
	mentions: dispatchMentions,
};
export const dispatch = async (ctx: IoCtx, input: { manage?: boolean } = {}, deps: Dependencies = defaults) => {
	if (hostIsShuttingDown(ctx.home)) return {};
	const loop = loopRuntimes.get(ctx.home);
	const track = <T>(id: "runtime" | "workers" | "messages", work: () => Promise<T>) =>
		loop && input.manage !== false ? loop.runStep(id, work) : work();
	const sessions = await track("runtime", () => deps.readSessions(ctx));
	if (input.manage !== false) loop?.record(`Read ${sessions.length} runtime processes.`, "info", "runtime");
	const results = await Promise.allSettled([
		input.manage === false ? Promise.resolve() : track("workers", () => deps.manage(ctx, { sessions })),
		track("messages", () => deps.mentions(ctx, sessions)),
	]);
	const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
	if (errors.length) throw new AggregateError(errors, errors.map((error) => String(error)).join("\n"));
	return {};
};
export const finished = (_ctx: IoCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
