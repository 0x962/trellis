import { join } from "node:path";
import type { Diagnostics } from "@trellis/api";
import { RUNTIME_PROTOCOL_VERSION, type RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeClient } from "../agents/native/connection.ts";
import { rows } from "../db/queries/support.ts";
import { listColumns, type StoredRun } from "./agentRuns/queries.ts";
import { projectUnresolvedAttempts } from "./agentRuns.ts";
import type { ServiceCtx } from "./support.ts";

export const diagnostics = async (ctx: ServiceCtx): Promise<Diagnostics> => {
	const runs = await ctx.newTx((tx) =>
		rows<StoredRun>(
			tx,
			sql`SELECT ${listColumns} FROM agent_runs WHERE runtime='native' ORDER BY updated_at DESC LIMIT 100`,
		),
	);
	let runtime: Diagnostics["runtime"];
	let sessions: RuntimeProcessStatus[] = [];
	try {
		const hello = await nativeClient(ctx.home).hello();
		sessions = (
			await nativeClient(ctx.home).list({
				ids: runs.flatMap((run) => (run.terminalId === null ? [] : [run.terminalId])),
			})
		).sessions;
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
	const unresolvedAttempts = projectUnresolvedAttempts(runs, sessions, ctx.home);
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
