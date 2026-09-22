import { fromHarnessModel, HarnessEffortSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { boxClocks, processLimit } from "../../agents/nativeFlow/boxClocks.ts";
import { taskKey } from "../../agents/nativeFlow/taskKey.ts";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { type ExecutionAttempt, reserveAttempt } from "../assignments/attempts.ts";
import type { StoredExecution } from "../flowExecutions/types.ts";
import { getAccount } from "../harnessAccounts/queries.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { projectRow } from "../projectRows.ts";
import { columns, type StoredRun } from "./queries.ts";

export type ResumeSession = {
	runId: string;
	previousAttemptId: string;
	providerSessionId: string;
	harness: "claude" | "codex" | "opencode" | "pi" | "muse" | "custom";
	model?: string;
	effort?: string;
	workspace: string;
	attempt: { id: string; token: string };
};

export async function reserveResume(ctx: ServiceCtx, tx: Tx, session: ResumeSession, reserve: boolean) {
	if (session.harness === "custom") return null;
	const [run] = await rows<StoredRun>(tx, sql`SELECT ${columns} FROM agent_runs WHERE id=${session.runId} FOR UPDATE`);
	if (
		!run ||
		(run.projectId === null && run.kind !== "session") ||
		run.closedAt !== null ||
		run.runtime !== "native" ||
		![session.previousAttemptId, session.attempt.id].includes(run.terminalId!)
	)
		return null;
	if (run.projectId && (await projectRow(tx, run.projectId)).archived_at !== null) return null;
	const config =
		run.kind !== "session" && run.projectId
			? await projectLaunchConfig(tx, { projectId: run.projectId, harness: run.harness! })
			: { directory: session.workspace, harness: run.harness!, accountId: null };
	if (run.ticketId !== null) {
		const ticket = await rows(tx, sql`SELECT id FROM tickets WHERE id=${run.ticketId}`);
		if (ticket.length === 0) return null;
	}
	const tasks = await rows<{ execution_id: string; key: string; attempt_id: string; result_id: string | null }>(
		tx,
		sql`SELECT execution_id,key,attempt_id,result_id FROM flow_execution_tasks WHERE run_id=${run.id}`,
	);
	let deadlineAt: number | undefined;
	let budgetMs: number | undefined;
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
		const step = execution.state.steps.find((item) => taskKey(item) === task.key)!;
		if (!["running", "unknown"].includes(step.state) || step.needsStop) return null;
		const limit = processLimit(boxClocks(execution.doc, execution.state, step));
		if (limit.deadlineAt !== undefined) deadlineAt = Math.min(deadlineAt ?? Infinity, limit.deadlineAt);
		if (limit.budgetMs !== undefined) budgetMs = Math.min(budgetMs ?? Infinity, limit.budgetMs);
	}
	if (deadlineAt !== undefined && deadlineAt <= ctx.now.getTime()) return null;
	if (run.accountId) {
		const account = await getAccount(tx, { id: run.accountId });
		if (account.harness !== session.harness)
			throw invalidInput("accountId", "The saved account belongs to another harness.");
	}
	const harness = {
		...config.harness,
		preset: session.harness,
		model: session.model ? fromHarnessModel(session.harness, session.model) : undefined,
		effort: session.effort === undefined ? undefined : HarnessEffortSchema.parse(session.effort),
	};
	let attempt: ExecutionAttempt | undefined;
	if (reserve && run.terminalId === session.previousAttemptId) {
		attempt = await reserveAttempt(ctx, tx, { runId: run.id, attempt: session.attempt });
		await tx.execute(
			sql`UPDATE agent_runs SET terminal_id=${attempt.id},session_id=${session.providerSessionId},workspace_id=${session.workspace},harness=${JSON.stringify(harness)}::jsonb,error=NULL,session_lost=false,updated_at=${ctx.now} WHERE id=${run.id}`,
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
		config: {
			...config,
			harness,
		},
		attempt,
		deadlineAt,
		budgetMs,
	};
}
