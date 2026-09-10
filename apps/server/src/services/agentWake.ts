import type { AgentSession, AgentWakeInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { type AgentsCtx, announce, clearBlock, selectSessions } from "./agentSessions.ts";
import { managedProject, readAgentSettings } from "./agentSettings.ts";
import { projectActivity } from "./projectRows.ts";
import { pathOf, resolveProject } from "./refs.ts";

// The newest manager of a project that trellis did not stop and whose
// terminal the runner reported.
export const managerOf = async (tx: Tx, projectId: string) =>
	(
		await selectSessions(
			tx,
			sql`s.project_id = ${projectId} AND s.role = 'manager' AND s.state <> 'stopped'
				AND s.workspace_id IS NOT NULL AND s.terminal_id IS NOT NULL`,
		)
	).at(-1);

export type WakePlan = { id: string; projectId: string; terminalId: string; relaunched: boolean };

// The runner types the text into the manager's terminal, or starts an
// exited manager again with the text as its prompt. The switches of the
// agent settings apply: with either one off, no manager is woken.
export const prepareWake = async (ctx: AgentsCtx, input: AgentWakeInput): Promise<WakePlan> => {
	const found = await ctx.newTx(async (tx) => {
		const project = await resolveProject(ctx, tx, input.project);
		const managed = managedProject(ctx, await readAgentSettings(tx), project.id);
		const manager = await managerOf(tx, managed.projectId);
		const path = pathOf(ctx.cache, managed.projectId);
		if (manager === undefined) throw fail("NOT_FOUND", { kind: "manager", ref: path });
		return { manager, path };
	});
	const { manager } = found;
	const woken = await ctx.runner.wake(
		{
			project: found.path,
			workspaceId: manager.workspaceId!,
			terminalId: manager.terminalId!,
			claudeSessionId: manager.claudeSessionId,
		},
		input.text,
	);
	return { id: manager.id, projectId: manager.projectId, terminalId: woken.terminalId, relaunched: woken.relaunched };
};

// A manager whose terminal is gone reads nothing that a wake types, so
// the runner starts it again in a new terminal. That start is a change a
// person must be able to find, so it becomes a row in the project's
// activity feed.
//
// The new terminal runs a new Claude that has not called agents.register,
// so the row reads `starting` until it does. A relaunch that never
// registers is then what the watchdog of the agents host looks for.
export const wake = async (ctx: AgentsCtx, tx: Tx, plan: WakePlan): Promise<AgentSession> => {
	const state = plan.relaunched ? "starting" : "running";
	await tx.execute(sql`
		UPDATE agent_sessions SET terminal_id = ${plan.terminalId}, state = ${state}, last_woken_at = ${ctx.now},
			updated_at = ${ctx.now}
		WHERE id = ${plan.id}
	`);
	if (plan.relaunched) {
		await clearBlock(ctx, tx, plan.id);
		await projectActivity(ctx, tx, plan.projectId, "agent.restarted", [
			{ field: "state", from: "exited", to: "starting", meta: { role: "manager" } },
		]);
	}
	return announce(ctx, tx, plan.id);
};
