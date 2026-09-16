import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import type { HarnessDescriptor } from "../../../agents/harnessHost/types.ts";
import { ensureNativeRuntime } from "../../../agents/native/connection.ts";
import { nativeHost } from "../../../agents/native/harnessHost.ts";
import { rows } from "../../../db/queries/support.ts";
import { getRun } from "../../agentRuns/queries.ts";
import type { IoCtx } from "../../support.ts";

export async function recoverBuilderStart(
	ctx: IoCtx,
	input: { id: string; run_id: string },
	runtime = ensureNativeRuntime,
) {
	const run = await ctx.newTx((tx) => getRun(tx, input.run_id));
	const allowed = () =>
		ctx.newTx((tx) =>
			rows(
				tx,
				sql`SELECT r.id FROM agent_runs r JOIN tickets t ON t.id=r.ticket_id JOIN statuses s ON s.id=t.status_id WHERE r.id=${run.id} AND r.closed_at IS NULL AND r.terminal_id=${run.terminalId} AND s.category='started'`,
			),
		);
	const cancel = () =>
		ctx.newTx((tx) => tx.execute(sql`UPDATE builder_start_requests SET state='canceled' WHERE id=${input.id}`));
	if ((await allowed()).length === 0) {
		await cancel();
		return;
	}
	const descriptor: HarnessDescriptor | { harness: "custom"; spec: LaunchSpec } = JSON.parse(
		await readFile(join(ctx.home, "harness-attempts", run.terminalId!, "launch.json"), "utf8"),
	);
	const client = await runtime(ctx.home);
	if ((await allowed()).length === 0) {
		await cancel();
		return;
	}
	const host = nativeHost(ctx.home, undefined, client);
	const session =
		descriptor.harness === "custom"
			? await client.start(descriptor.spec).then(() => client.inspect(run.terminalId!))
			: (await host.startPrepared(run.terminalId!)).process;
	await ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET workspace_id=${descriptor.spec.cwd},session_id=${session.agent?.sessionId ?? null},closed_at=CASE WHEN ${session.status === "exited"} AND NOT (kind='builder' AND EXISTS (SELECT 1 FROM tickets t JOIN statuses s ON s.id=t.status_id WHERE t.id=agent_runs.ticket_id AND s.category='started') AND NOT EXISTS (SELECT 1 FROM flow_execution_tasks task WHERE task.run_id=agent_runs.id)) THEN ${ctx.now()}::timestamptz ELSE NULL END,error=${session.agent?.error ?? session.error},updated_at=${ctx.now()} WHERE id=${run.id} AND terminal_id=${run.terminalId} AND closed_at IS NULL`,
		),
	);
}
