import type { AgentSession } from "@trellis/api";
import { sql } from "drizzle-orm";
import { restartText } from "../agents/launch.ts";
import { managerTitle } from "../agents/names.ts";
import type { AgentPlace } from "../agents/runner.ts";
import { textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { type AgentsCtx, announce, insertSession, LIVE_STATES, newSessionId, selectSessions } from "./agentSessions.ts";
import { managedProject, readAgentSettings } from "./agentSettings.ts";
import { effectiveRepos, runnerProjectOf } from "./agentStart.ts";
import { managerOf } from "./agentWake.ts";
import { pathOf } from "./refs.ts";

// The two services the agents host runs at its start, as the system actor.
// Neither is on the API.

export type ReconcilePlan = { exited: string[] };

// A session holds its terminal only while the runner lists that terminal as
// running. The runner lists each workspace once.
export const prepareReconcile = async (ctx: AgentsCtx): Promise<ReconcilePlan> => {
	const live = await ctx.newTx((tx) =>
		selectSessions(tx, sql`s.state IN ${LIVE_STATES} AND s.workspace_id IS NOT NULL AND s.terminal_id IS NOT NULL`),
	);
	const exited: string[] = [];
	for (const workspaceId of new Set(live.map((session) => session.workspaceId!))) {
		const tabs = await ctx.runner.terminals(workspaceId);
		for (const session of live.filter((found) => found.workspaceId === workspaceId)) {
			const tab = tabs.find((found) => found.terminalId === session.terminalId);
			if (tab === undefined || tab.exited) exited.push(session.id);
		}
	}
	return { exited };
};

export const reconcile = async (ctx: AgentsCtx, tx: Tx, plan: ReconcilePlan) => {
	if (plan.exited.length > 0) {
		await tx.execute(
			sql`UPDATE agent_sessions SET state = 'exited', updated_at = ${ctx.now} WHERE id = ANY(${textArray(plan.exited)})`,
		);
	}
	for (const id of plan.exited) await announce(ctx, tx, id);
	return { exited: plan.exited.length };
};

export type ManagerPlan = {
	projectId: string;
	managerId: string | null;
	title: string;
	place: AgentPlace & { started: boolean };
};

// The runner finds the manager workspace by its branch. A live manager tab
// stays; an exited manager resumes its Claude session with the restart
// text as its prompt; a project without a manager gets a new one.
export const prepareManager = async (ctx: AgentsCtx, input: { project: string }): Promise<ManagerPlan> => {
	const found = await ctx.newTx(async (tx) => {
		const managed = managedProject(ctx, await readAgentSettings(tx), input.project);
		const manager = await managerOf(tx, managed.projectId);
		return { managed, manager, repos: await effectiveRepos(ctx, tx, managed.projectId) };
	});
	const project = pathOf(ctx.cache, found.managed.projectId);
	const place = await ctx.runner.ensureManager({
		project,
		runnerProjectId: await runnerProjectOf(ctx, found.managed, found.repos),
		baseBranch: found.managed.baseBranch,
		claudeSessionId: found.manager === undefined ? null : found.manager.claudeSessionId,
		text: restartText(project),
	});
	return {
		projectId: found.managed.projectId,
		managerId: found.manager === undefined ? null : found.manager.id,
		title: managerTitle(project),
		place,
	};
};

// A tab the runner started runs a new Claude process, which reports itself
// through agents.register; until then it is `starting`. A tab the runner
// found runs already.
export const recordManager = async (ctx: AgentsCtx, tx: Tx, plan: ManagerPlan): Promise<AgentSession> => {
	const state = plan.place.started ? "starting" : "running";
	const { workspaceId, terminalId, openUrl } = plan.place;
	if (plan.managerId !== null) {
		await tx.execute(sql`
			UPDATE agent_sessions SET workspace_id = ${workspaceId}, terminal_id = ${terminalId}, open_url = ${openUrl},
				state = ${state}, updated_at = ${ctx.now}
			WHERE id = ${plan.managerId}
		`);
		return announce(ctx, tx, plan.managerId);
	}
	const id = newSessionId();
	await insertSession(ctx, tx, {
		id,
		projectId: plan.projectId,
		ticketId: null,
		role: "manager",
		state,
		workspaceId,
		terminalId,
		claudeSessionId: null,
		title: plan.title,
		openUrl,
	});
	return announce(ctx, tx, id);
};
