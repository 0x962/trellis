import { createHash } from "node:crypto";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { advanceFlow } from "../../agents/nativeFlow/advanceFlow.ts";
import { pendingFlowActions } from "../../agents/nativeFlow/pendingFlowActions.ts";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { reserve } from "../agentRuns/reserve.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { readExecution } from "./queries.ts";
import { saveState } from "./saveState.ts";
export async function claimNext(ctx: ServiceCtx, tx: Tx, input: { id: string }) {
	const execution = await readExecution(tx, input.id, true);
	const state = advanceFlow(execution.doc, execution.state, { type: "tick" }, ctx.now.getTime());
	await saveState(ctx, tx, execution, state);
	const actions = pendingFlowActions(execution.doc, state).filter((action) => action.type === "agent");
	if (actions.length === 0) return null;
	await tx.execute(sql`SELECT id FROM projects WHERE id=${execution.project_id} FOR UPDATE`);
	const config = await projectLaunchConfig(tx, {
		projectId: execution.project_id,
		harness: HarnessSchema.parse({ preset: "claude" }),
	});
	const action = actions[0]!;
	const instruction = [
		execution.doc.flow.briefing,
		`Flow step: ${action.nodeId}`,
		action.instruction,
		`Prior step outputs:\n${JSON.stringify(action.inputs)}`,
		action.purpose === "step" ? "" : "Answer the condition with exactly YES or NO as the complete final response.",
	]
		.filter(Boolean)
		.join("\n\n");
	const node = execution.doc.nodes.find((item) => item.id === action.nodeId)!;
	const reservation = await reserve(
		ctx,
		tx,
		{
			ticket: execution.ticket_id,
			harness: config.harness,
			requestId: createHash("sha256").update(`${execution.id}:${action.key}`).digest("hex"),
		},
		[],
		{ config, flow: { name: node.title, instruction } },
	);
	if (reservation.replay || reservation.attempt === null)
		throw new Error("A flow claim must reserve a new native attempt");
	await tx.execute(
		sql`INSERT INTO flow_execution_tasks (execution_id,key,run_id,attempt_id,created_at) VALUES (${execution.id},${action.key},${reservation.run.id},${reservation.attempt.id},${ctx.now})`,
	);
	await saveState(
		ctx,
		tx,
		{ ...execution, state },
		advanceFlow(execution.doc, state, { type: "started", key: action.key }, ctx.now.getTime()),
	);
	const deadlines: number[] = [];
	let step = state.steps.find((step) => `${step.key}:${step.phase}:${step.round}` === action.key)!;
	while (step.parentKey !== null) {
		step = state.steps.find((parent) => parent.key === step.parentKey)!;
		if (step.deadlineAt !== null) deadlines.push(step.deadlineAt);
	}
	return {
		...reservation,
		attempt: reservation.attempt,
		id: execution.id,
		key: action.key,
		deadlineAt: deadlines.length === 0 ? undefined : Math.min(...deadlines),
	};
}
