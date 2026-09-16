import type { RestartSession } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import { taskKey } from "../../agents/nativeFlow/taskKey.ts";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { readNativeWork } from "../agentRuns/nativeControl.ts";
import { columns, type StoredRun } from "../agentRuns/queries.ts";
import { type ExecutionAttempt, reserveAttempt } from "../assignments/attempts.ts";
import type { StoredExecution } from "../flowExecutions/types.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { projectRow } from "../projectRows.ts";

export async function reserveRestart(ctx: ServiceCtx, tx: Tx, session: RestartSession, reserve: boolean) {
	const [run] = await rows<StoredRun>(tx, sql`SELECT ${columns} FROM agent_runs WHERE id=${session.runId} FOR UPDATE`);
	if (
		!run ||
		run.projectId === null ||
		run.closedAt !== null ||
		run.runtime !== "native" ||
		![session.previousAttemptId, session.attempt.id].includes(run.terminalId!)
	)
		return null;
	if ((await readNativeWork(tx)).paused) return null;
	const project = await projectRow(tx, run.projectId);
	const config = await projectLaunchConfig(tx, { projectId: run.projectId });
	if (project.archived_at !== null) return null;
	if (run.ticketId !== null) {
		const [ticket] = await rows<{ completed_at: string | null }>(
			tx,
			sql`SELECT completed_at FROM tickets WHERE id=${run.ticketId}`,
		);
		if (!ticket || ticket.completed_at !== null) return null;
	}
	const tasks = await rows<{ execution_id: string; key: string; attempt_id: string; result_id: string | null }>(
		tx,
		sql`SELECT execution_id,key,attempt_id,result_id FROM flow_execution_tasks WHERE run_id=${run.id}`,
	);
	let deadlineAt: number | undefined;
	for (const task of tasks) {
		const [execution] = await rows<StoredExecution>(
			tx,
			sql`SELECT * FROM flow_executions WHERE id=${task.execution_id} FOR UPDATE`,
		);
		if (
			!execution ||
			task.result_id !== null ||
			!["running", "waiting"].includes(execution.state.status) ||
			![session.previousAttemptId, session.attempt.id].includes(task.attempt_id)
		)
			return null;
		let step = execution.state.steps.find((item) => taskKey(item) === task.key)!;
		if (!["running", "unknown"].includes(step.state) || step.needsStop) return null;
		while (true) {
			if (step.deadlineAt !== null) deadlineAt = Math.min(deadlineAt ?? Infinity, step.deadlineAt);
			if (step.parentKey === null) break;
			step = execution.state.steps.find((item) => item.key === step.parentKey)!;
		}
	}
	if (deadlineAt !== undefined && deadlineAt <= ctx.now.getTime()) return null;
	let attempt: ExecutionAttempt | undefined;
	if (reserve && run.terminalId === session.previousAttemptId) {
		if (run.kind === "manager") {
			if (run.personaId === null)
				throw invalidInput("personaId", "Select a current manager persona before you restart this assignment.");
			const [persona] = await rows<{ name: string; instruction: string }>(
				tx,
				sql`UPDATE agent_runs AS r SET persona_name=p.name,instruction=p.instruction FROM personas AS p WHERE r.id=${run.id} AND p.id=r.persona_id RETURNING p.name,p.instruction`,
			);
			run.personaName = persona!.name;
			run.instruction = persona!.instruction;
		}
		attempt = await reserveAttempt(ctx, tx, { runId: run.id, attempt: session.attempt });
		await tx.execute(
			sql`UPDATE agent_runs SET terminal_id=${attempt.id},session_id=${session.providerSessionId},workspace_id=${session.workspace},error=NULL,session_lost=false,updated_at=${ctx.now} WHERE id=${run.id}`,
		);
		await tx.execute(
			sql`UPDATE flow_execution_tasks SET attempt_id=${attempt.id} WHERE run_id=${run.id} AND attempt_id=${session.previousAttemptId} AND result_id IS NULL`,
		);
		run.terminalId = attempt.id;
		run.workspaceId = session.workspace;
		run.sessionId = session.providerSessionId;
	} else if (reserve) {
		const [saved] = await rows<{ generation: number }>(
			tx,
			sql`SELECT generation FROM agent_execution_attempts WHERE id=${session.attempt.id} AND run_id=${run.id}`,
		);
		attempt = { ...session.attempt, generation: saved!.generation };
	}
	return {
		run,
		config: { ...config, harness: { ...config.harness, preset: session.harness, model: session.model } },
		attempt,
		deadlineAt,
	};
}
