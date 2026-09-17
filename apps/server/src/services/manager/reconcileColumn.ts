import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeHost, nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import { prepareSend } from "../agentRuns/communication.ts";
import { stopNative } from "../agentRuns/nativeLifecycle.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { getRun } from "../agentRuns/queries.ts";
import { loopRuntimes } from "../loops/runtime.ts";
import type { IoCtx } from "../support.ts";
import { columnContext } from "./columnContext.ts";
import { type ColumnState, columnStates } from "./columnState.ts";
import { reportLaunch } from "./reportLaunch.ts";
import { reserveColumnWorker } from "./reserveColumnWorker.ts";
import { workerAction } from "./workerAction.ts";
import { workspaceExists } from "./workspaceExists.ts";

const defaults = {
	workspaceExists,
	stop: stopNative,
	start: startNative,
	send: prepareSend,
	preset: nativePreset,
	list: (home: string) => nativeHost(home).list(),
};

export async function reconcileColumn(
	ctx: IoCtx,
	state: ColumnState,
	sessions: RuntimeProcessStatus[],
	deps = defaults,
) {
	if (!state.runId && state.allowed && state.agentConfig) {
		await ctx.newTx(async (tx) => {
			const [existing] = await rows<{ id: string }>(
				tx,
				sql`SELECT r.id FROM agent_runs r
				WHERE r.ticket_id=${state.ticketId} AND r.runtime='native'
				AND r.kind IN ('builder','reviewer') AND NOT EXISTS (SELECT 1 FROM flow_execution_tasks f WHERE f.run_id=r.id)
				ORDER BY (r.closed_at IS NULL) DESC,r.created_at DESC,r.id DESC LIMIT 1`,
			);
			if (existing)
				await tx.execute(sql`INSERT INTO column_workers (ticket_id,status_id,run_id)
				VALUES (${state.ticketId},${state.statusId},${existing.id}) ON CONFLICT DO NOTHING`);
		});
		[state] = (await ctx.newTx((tx) => columnStates(tx, state.ticketId))) as [ColumnState];
	}
	const run = state.runId ? await ctx.newTx((tx) => getRun(tx, state.runId!)) : null;
	let session = run ? sessions.find((item) => item.id === run.terminalId) : undefined;
	if (run?.terminalId && !session) session = (await deps.list(ctx.home)).find((item) => item.id === run.terminalId);
	const changedColumn = state.retired || state.assignedStatusId !== state.statusId;
	const enabled =
		state.allowed && state.agentConfig !== null && state.category !== "done" && state.category !== "canceled";
	if (session?.status === "unknown") throw new Error(`Cannot confirm process ownership for ${run!.id}`);
	const action = session ? workerAction(session, ctx.now()) : null;
	if (run && session && (changedColumn || !enabled || action === "restart")) {
		if (session.status !== "exited") await deps.stop(ctx, run);
	}
	if (!enabled) {
		if (run)
			await ctx.newTx(async (tx) => {
				await tx.execute(sql`UPDATE agent_runs SET closed_at=coalesce(closed_at,${ctx.now()}) WHERE id=${run.id}`);
				await tx.execute(
					sql`UPDATE column_workers SET retired=true,heartbeat_at=NULL WHERE ticket_id=${state.ticketId} AND run_id=${run.id}`,
				);
			});
		return;
	}
	if (session && !changedColumn && action !== "restart") {
		if (
			action === "continue" &&
			(!state.heartbeatAt || ctx.now().getTime() - new Date(state.heartbeatAt).getTime() >= 30_000)
		) {
			const context = await ctx.newTx((tx) => columnContext(tx, { ticketId: state.ticketId }));
			await deps.send(ctx, {
				id: run!.id,
				expectedTerminalId: session.id,
				expectedSessionId: session.agent?.sessionId ?? null,
				messageId: `column-${session.id}-${Date.parse(session.activity!.updatedAt)}`,
				text: JSON.stringify({ type: "trellis.column.continue", ...context }),
				idleForMs: 1000,
			});
			await ctx.newTx((tx) =>
				tx.execute(
					sql`UPDATE column_workers SET heartbeat_at=${ctx.now()} WHERE ticket_id=${state.ticketId} AND run_id=${run!.id}`,
				),
			);
		}
		return;
	}
	const missingWorkspace = !!run?.workspaceId && !(await deps.workspaceExists(run.workspaceId));
	const claim = await ctx.newTx((tx) =>
		reserveColumnWorker({ ...ctx.core, now: ctx.now() }, tx, state, run?.terminalId, !missingWorkspace),
	);
	if (!claim) return;
	const resume = !!(
		!missingWorkspace &&
		session?.agent?.sessionId &&
		!changedColumn &&
		run?.personaId === claim.run.personaId &&
		run.accountId === claim.run.accountId &&
		(await deps.preset(ctx.home, session.id)) === claim.config.harness.preset
	);
	loopRuntimes
		.get(ctx.home)
		?.record(`${resume ? "Resume" : "Start"} ${claim.run.personaName} for ${claim.run.ticketIdentifier}.`);
	await deps.start(ctx, {
		...claim,
		resume,
		previousAttemptId: session?.id,
		context: `${claim.context}\n${JSON.stringify({
			previousRunId: run?.id ?? null,
			previousWorkspace: run?.workspaceId ?? null,
			previousWorkspaceMissing: missingWorkspace,
			previousTranscript: run ? join(ctx.home, "agents", run.id, "output.txt") : null,
		})}`,
		resumePrompt: resume
			? JSON.stringify({
					type: "trellis.column.restarted",
					ticketId: state.ticketId,
					runId: claim.run.id,
					previousRunId: run!.id,
					persona: { id: claim.run.personaId, name: claim.run.personaName, instruction: claim.run.instruction },
					context: claim.context,
				})
			: undefined,
	});
	await ctx.newTx((tx) => reportLaunch(ctx, tx, { id: claim.run.id }));
	ctx.emit({ type: "agent-runs.changed", id: claim.run.id });
}
