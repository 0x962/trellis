import { join } from "node:path";
import type { Diagnostics } from "@trellis/api";
import { RUNTIME_PROTOCOL_VERSION } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeClient } from "../agents/native/connection.ts";
import { rows } from "../db/queries/support.ts";
import { readNativeWork } from "./agentRuns/nativeControl.ts";
import type { ServiceCtx } from "./support.ts";

export const diagnostics = async (ctx: ServiceCtx): Promise<Diagnostics> => {
	let runtime: Diagnostics["runtime"];
	try {
		const hello = await nativeClient(ctx.home).hello();
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
	return ctx.newTx(async (tx) => {
		const [queue] = await rows<Diagnostics["queue"]>(
			tx,
			sql`SELECT
			count(*) FILTER (WHERE state='pending')::int AS pending,
			count(*) FILTER (WHERE state='sending')::int AS sending,
			count(*) FILTER (WHERE state='unknown')::int AS unknown,
			min(due_at) FILTER (WHERE state IN ('pending','sending','unknown')) AS "oldestDueAt"
			FROM manager_dispatches`,
		);
		const [observations] = await rows<{ at: string | null }>(
			tx,
			sql`SELECT max(updated_at) AS at FROM agent_harness_observations`,
		);
		const unresolvedAttempts = await rows<Diagnostics["unresolvedAttempts"][number]>(
			tx,
			sql`
			SELECT id,state,error FROM agent_runs WHERE runtime='native' AND state IN ('interrupted','failed') ORDER BY updated_at DESC LIMIT 100`,
		);
		return {
			host: { bootId: ctx.bootId, version: ctx.version, home: ctx.home },
			runtime,
			...(await readNativeWork(tx)),
			queue: queue!,
			lastObservationAt: observations!.at,
			unresolvedAttempts,
			logs: [join(ctx.home, "server.log"), join(ctx.home, "runtime", "runtime.log")],
		};
	});
};
