import type { AgentSession, AgentWakeInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../db/tx.ts";
import { type ManagerPlan, prepareManager, recordManager } from "./agentManager.ts";
import { type AgentsCtx, announce, managerOf } from "./agentSessions.ts";
import { managedProject, readAgentSettings } from "./agentSettings.ts";
import { pathOf, resolveProject } from "./refs.ts";

// `started`: the project had no manager with a terminal, so the wake
// started one. A new manager reads its inbox at start, so it needs no text.
export type WakePlan = { kind: "woken"; id: string; terminalId: string } | { kind: "started"; manager: ManagerPlan };

// The runner types the text into the manager's terminal, or starts an
// exited manager again with the text as its prompt. A project without a
// manager gets one, and a start the runner refuses is recorded as a failed
// manager. The switches of the agent settings apply: with either one off,
// no manager is woken.
export const prepareWake = async (ctx: AgentsCtx, input: AgentWakeInput): Promise<WakePlan> => {
	const found = await ctx.newTx(async (tx) => {
		const project = await resolveProject(ctx, tx, input.project);
		const managed = managedProject(ctx, await readAgentSettings(tx), project.id);
		return {
			projectId: managed.projectId,
			manager: await managerOf(tx, managed.projectId),
			path: pathOf(ctx.cache, managed.projectId),
		};
	});
	const { manager } = found;
	if (manager === undefined) return { kind: "started", manager: await prepareManager(ctx, { project: found.projectId }) };
	const woken = await ctx.runner.wake(
		{
			project: found.path,
			workspaceId: manager.workspaceId!,
			terminalId: manager.terminalId!,
			claudeSessionId: manager.claudeSessionId,
		},
		input.text,
	);
	return { kind: "woken", id: manager.id, terminalId: woken.terminalId };
};

// A relaunched manager runs in a new terminal, so the row takes that
// terminal and the running state.
export const wake = async (ctx: AgentsCtx, tx: Tx, plan: WakePlan): Promise<AgentSession> => {
	if (plan.kind === "started") return recordManager(ctx, tx, plan.manager);
	await tx.execute(sql`
		UPDATE agent_sessions SET terminal_id = ${plan.terminalId}, state = 'running', error = NULL,
			last_woken_at = ${ctx.now}, updated_at = ${ctx.now}
		WHERE id = ${plan.id}
	`);
	return announce(ctx, tx, plan.id);
};
