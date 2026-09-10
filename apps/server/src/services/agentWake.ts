import type { AgentSession, AgentWakeInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { type AgentsCtx, announce, selectSessions } from "./agentSessions.ts";
import { managedProject, readAgentSettings } from "./agentSettings.ts";
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

export type WakePlan = { id: string; terminalId: string };

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
	return { id: manager.id, terminalId: woken.terminalId };
};

// A relaunched manager runs in a new terminal, so the row takes that
// terminal and the running state.
export const wake = async (ctx: AgentsCtx, tx: Tx, plan: WakePlan): Promise<AgentSession> => {
	await tx.execute(sql`
		UPDATE agent_sessions SET terminal_id = ${plan.terminalId}, state = 'running', last_woken_at = ${ctx.now},
			updated_at = ${ctx.now}
		WHERE id = ${plan.id}
	`);
	return announce(ctx, tx, plan.id);
};
