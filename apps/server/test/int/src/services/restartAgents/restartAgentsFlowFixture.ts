import { randomUUID } from "node:crypto";
import type { RestartPlan } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import type { Harness } from "../../../../helpers/services.ts";

export const seedRestartFlow = async (h: Harness, plan: RestartPlan, deadlineAt = Date.now() + 60000) => {
	const session = plan.sessions[0]!;
	const executionId = ulid();
	const state = {
		version: 1,
		flowId: ulid(),
		flowVersion: 1,
		status: "running",
		startedAt: Date.now(),
		updatedAt: Date.now(),
		error: null,
		steps: [
			{
				key: "group",
				nodeId: "group",
				parentKey: null,
				iteration: 0,
				round: 0,
				state: "running",
				phase: "children",
				output: null,
				decision: null,
				error: null,
				startedAt: Date.now(),
				deadlineAt,
				needsStop: false,
			},
			{
				key: "worker",
				nodeId: "worker",
				parentKey: "group",
				iteration: 0,
				round: 0,
				state: "running",
				phase: "step",
				output: null,
				decision: null,
				error: null,
				startedAt: Date.now(),
				deadlineAt: null,
				needsStop: false,
			},
		],
	};
	const project = (await h.rows(sql`SELECT project_id FROM agent_runs`))[0]!.project_id;
	await h.read(async (tx) => {
		const status = await seedStatus(tx, {
			projectId: project,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		const ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId: status });
		await tx.execute(sql`UPDATE agent_runs SET ticket_id=${ticket} WHERE id=${session.runId}`);
		await tx.execute(
			sql`INSERT INTO agent_execution_attempts (id,run_id,generation,token_hash,created_at) VALUES (${session.previousAttemptId},${session.runId},1,'old',now())`,
		);
		await tx.execute(
			sql`INSERT INTO flow_executions (id,flow_id,ticket_id,project_id,default_persona_id,actor_kind,actor_name,request_id,request,doc,personas,state,revision,created_at,updated_at) VALUES (${executionId},${state.flowId},${ticket},${project},'persona','human','dana',${randomUUID()},'{}','{}','{}',${JSON.stringify(state)}::jsonb,1,now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO flow_execution_tasks (execution_id,key,run_id,attempt_id,created_at) VALUES (${executionId},'worker:step:0',${session.runId},${session.previousAttemptId},now())`,
		);
	});
	return { executionId, state, deadlineAt };
};
