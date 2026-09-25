import { join } from "node:path";
import type { Diagnostics } from "@trellis/api";
import { RUNTIME_PROTOCOL_VERSION, type RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { nativeClient } from "../agents/native/connection.ts";
import { listUnresolvedAttempts } from "./agentRuns.ts";
import type { ServiceCtx } from "./support.ts";

export const diagnostics = async (ctx: ServiceCtx): Promise<Diagnostics> => {
	let runtime: Diagnostics["runtime"];
	let sessions: RuntimeProcessStatus[] = [];
	try {
		const hello = await nativeClient(ctx.home).hello();
		sessions = (await nativeClient(ctx.home).list()).sessions;
		runtime = {
			state: "running",
			pid: hello.pid,
			protocol: hello.version,
			expectedProtocol: RUNTIME_PROTOCOL_VERSION,
			error: null,
		};
	} catch (error) {
		const stopped = ["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "");
		runtime = {
			state: stopped ? "stopped" : "unavailable",
			pid: null,
			protocol: null,
			expectedProtocol: RUNTIME_PROTOCOL_VERSION,
			error: stopped ? null : error instanceof Error ? error.message : String(error),
		};
	}
	const unresolvedAttempts = await ctx.newTx((tx) => listUnresolvedAttempts(tx, { sessions, home: ctx.home }));
	return {
		host: { bootId: ctx.bootId, version: ctx.version, home: ctx.home },
		runtime,
		lastObservationAt:
			sessions
				.map((session) => session.checkedAt)
				.sort()
				.at(-1) ?? null,
		unresolvedAttempts,
		logs: [join(ctx.home, "server.log"), join(ctx.home, "runtime", "runtime.log")],
	};
};
