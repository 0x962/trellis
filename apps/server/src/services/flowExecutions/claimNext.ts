import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { advanceFlow } from "../../agents/nativeFlow/advanceFlow.ts";
import { pendingFlowActions } from "../../agents/nativeFlow/pendingFlowActions.ts";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { readNativeWork } from "../agentRuns/nativeControl.ts";
import { reserve } from "../agentRuns/reserve.ts";
import { managerConfigOf, projectRow } from "../projectRows.ts";
import { readExecution } from "./queries.ts";
import { saveState } from "./saveState.ts";
export async function claimNext(ctx: ServiceCtx, tx: Tx, input: { id: string }) {
	const execution = await readExecution(tx, input.id, true);
	const state = advanceFlow(execution.doc, execution.state, { type: "tick" }, ctx.now.getTime());
	await saveState(ctx, tx, execution, state);
	const actions = pendingFlowActions(execution.doc, state).filter((action) => action.type === "agent");
	if (actions.length === 0 || (await readNativeWork(tx)).paused) return null;
	await tx.execute(sql`SELECT id FROM projects WHERE id=${execution.project_id} FOR UPDATE`);
	const config = managerConfigOf(await projectRow(tx, execution.project_id));
	if (config.dispatchPaused) return null;
	if (config.ade !== "native" || config.harness.preset === "custom" || !config.trustedDirectory)
		throw invalidInput("project", "The flow requires a trusted project with a built-in harness.");
	const [active] = await rows<{ count: number }>(
		tx,
		sql`SELECT count(*)::int AS count FROM agent_runs WHERE project_id=${execution.project_id} AND kind<>'manager' AND closed_at IS NULL`,
	);
	if (active!.count >= config.concurrency) return null;
	const assigned = await rows<{ personaId: string | null }>(
		tx,
		sql`SELECT persona_id AS "personaId" FROM agent_runs
		WHERE ticket_id=${execution.ticket_id} AND runtime='native' AND closed_at IS NULL`,
	);
	const action = actions.find(
		(action) => !assigned.some((run) => run.personaId === (action.personaId ?? execution.default_persona_id)),
	);
	if (!action) return null;
	const personaId = action.personaId ?? execution.default_persona_id;
	const reservation = await reserve(ctx, tx, {
		ticket: execution.ticket_id,
		personaId,
		requestId: createHash("sha256").update(`${execution.id}:${action.key}`).digest("hex"),
	});
	if (reservation.replay || reservation.attempt === null)
		throw new Error("A flow claim must reserve a new native attempt");
	const persona = execution.personas[personaId]!;
	const instruction = [
		persona.instruction,
		execution.doc.flow.briefing,
		`Flow step: ${action.nodeId}`,
		action.instruction,
		`Prior step outputs:\n${JSON.stringify(action.inputs)}`,
		action.purpose === "step" ? "" : "Answer the condition with exactly YES or NO as the complete final response.",
	]
		.filter(Boolean)
		.join("\n\n");
	await tx.execute(
		sql`UPDATE agent_runs SET instruction=${instruction},name=${persona.name},persona_name=${persona.name} WHERE id=${reservation.run.id}`,
	);
	reservation.run.instruction = instruction;
	reservation.run.personaName = persona.name;
	reservation.run.name = persona.name;
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
