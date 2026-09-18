import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { Tx } from "../../db/tx.ts";
import { hostIsShuttingDown } from "../agentRuns/hostShutdown.ts";
import { dispatchMentions } from "../commentMentions/dispatch.ts";
import { loopRuntimes } from "../loops/runtime.ts";
import { manage } from "../manager/manager.ts";
import type { IoCtx } from "../support.ts";

type Dependencies = {
	readSessions: (home: string) => Promise<RuntimeProcessStatus[]>;
	manage: typeof manage;
	mentions: typeof dispatchMentions;
};
// The beat needs the running processes only: the copilot check reads an
// exited copilot by its id, and a message goes to a running process. The
// runtime keeps exited records for days, so a full list would carry them
// on every beat.
const defaults: Dependencies = {
	readSessions: async (home) =>
		nativeHost(home, undefined, await ensureNativeRuntime(home)).list({ status: "running" }),
	manage,
	mentions: dispatchMentions,
};
export const dispatch = async (ctx: IoCtx, input: { manage?: boolean } = {}, deps: Dependencies = defaults) => {
	if (hostIsShuttingDown(ctx.home)) return {};
	const loop = loopRuntimes.get(ctx.home);
	const track = <T>(id: "runtime" | "workers" | "messages", work: () => Promise<T>) =>
		loop && input.manage !== false ? loop.runStep(id, work) : work();
	const sessions = await track("runtime", () => deps.readSessions(ctx.home));
	if (input.manage !== false) loop?.record(`Read ${sessions.length} running processes.`, "info", "runtime");
	const results = await Promise.allSettled([
		input.manage === false ? Promise.resolve() : track("workers", () => deps.manage(ctx, { sessions })),
		track("messages", () => deps.mentions(ctx, sessions)),
	]);
	const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
	if (errors.length) throw new AggregateError(errors, errors.map((error) => String(error)).join("\n"));
	return {};
};
export const finished = (_ctx: IoCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
