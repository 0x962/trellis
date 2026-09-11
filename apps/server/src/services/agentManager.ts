import { type AgentRetryManagerInput, type AgentSession, type AgentState, agentTitle, restartText } from "@trellis/api";
import { sql } from "drizzle-orm";
import { type AgentPlace, isStartFailure } from "../agents/runner.ts";
import { requireActor } from "../context.ts";
import { textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import {
	type AgentsCtx,
	announce,
	failSession,
	insertSession,
	LIVE_STATES,
	managerOf,
	newSessionId,
	reserveName,
	selectSessions,
} from "./agentSessions.ts";
import { hostOf, managedProject, readAgentSettings } from "./agentSettings.ts";
import { baseBranchOf, effectiveRepos, runnerProjectOf } from "./agentStart.ts";
import { pathOf, resolveProject } from "./refs.ts";

// The services that start a project's manager: the agents host runs
// reconcile and ensureManager as the system actor, and a person runs
// retryManager through the API.

export type ReconcilePlan = { exited: string[]; running: string[] };

// A session holds its terminal only while the runner lists that terminal as
// running. The runner lists each workspace once, on the machine the
// project's settings name. A tab that shows the agent's name runs that
// agent, so a session that waits for the agent's first word runs.
export const prepareReconcile = async (ctx: AgentsCtx): Promise<ReconcilePlan> => {
	const { live, settings } = await ctx.newTx(async (tx) => ({
		live: await selectSessions(
			tx,
			sql`s.state IN ${LIVE_STATES} AND s.workspace_id IS NOT NULL AND s.terminal_id IS NOT NULL`,
		),
		settings: await readAgentSettings(tx),
	}));
	const exited: string[] = [];
	const running: string[] = [];
	for (const workspaceId of new Set(live.map((session) => session.workspaceId!))) {
		const owner = live.find((found) => found.workspaceId === workspaceId)!;
		const tabs = await ctx.runner.terminals(workspaceId, hostOf(settings, owner.projectId));
		for (const session of live.filter((found) => found.workspaceId === workspaceId)) {
			const tab = tabs.find((found) => found.terminalId === session.terminalId);
			if (tab === undefined || tab.exited) exited.push(session.id);
			else if (session.state === "starting" && tab.title === session.title) running.push(session.id);
		}
	}
	return { exited, running };
};

const setState = async (ctx: AgentsCtx, tx: Tx, state: AgentState, ids: string[]) => {
	if (ids.length === 0) return;
	await tx.execute(
		sql`UPDATE agent_sessions SET state = ${state}, updated_at = ${ctx.now} WHERE id = ANY(${textArray(ids)})`,
	);
	for (const id of ids) await announce(ctx, tx, id);
};

export const reconcile = async (ctx: AgentsCtx, tx: Tx, plan: ReconcilePlan) => {
	await setState(ctx, tx, "exited", plan.exited);
	await setState(ctx, tx, "running", plan.running);
	return { exited: plan.exited.length };
};

// `manager` is the row the start writes to, or null for a new row. The
// outcome is the runner's place for the manager, or the message of the
// runner failure.
export type ManagerPlan = {
	projectId: string;
	manager: { id: string; state: AgentState } | null;
	title: string;
	outcome: { place: AgentPlace & { started: boolean } } | { error: string };
};

// A failed start that never got a workspace. The next start writes to this
// row, so failed starts leave one manager row per project.
const failedManagerOf = async (tx: Tx, projectId: string) =>
	(
		await selectSessions(
			tx,
			sql`s.project_id = ${projectId} AND s.role = 'manager' AND s.state = 'failed' AND s.workspace_id IS NULL`,
		)
	).at(-1);

// The runner finds the manager workspace by its branch. A live manager tab
// stays; an exited manager resumes its Claude session with the restart
// text as its prompt; a project without a manager gets a new one. A runner
// failure is data: the plan carries its message.
export const prepareManager = async (ctx: AgentsCtx, input: { project: string }): Promise<ManagerPlan> => {
	const found = await ctx.newTx(async (tx) => {
		const managed = managedProject(ctx, await readAgentSettings(tx), input.project);
		const manager = (await managerOf(tx, managed.projectId)) ?? (await failedManagerOf(tx, managed.projectId));
		return { managed, manager, repos: await effectiveRepos(ctx, tx, managed.projectId) };
	});
	const project = pathOf(ctx.cache, found.managed.projectId);
	const plan = {
		projectId: found.managed.projectId,
		manager: found.manager === undefined ? null : { id: found.manager.id, state: found.manager.state },
		title: agentTitle({ role: "manager", project }),
	};
	try {
		const runnerProjectId = await runnerProjectOf(ctx, found.managed, found.repos);
		const place = await ctx.runner.ensureManager({
			project,
			runnerProjectId,
			host: found.managed.supersetHostId,
			baseBranch: await baseBranchOf(ctx, found.managed, runnerProjectId),
			claudeSessionId: found.manager === undefined ? null : found.manager.claudeSessionId,
			text: restartText(project),
		});
		return { ...plan, outcome: { place } };
	} catch (error) {
		if (!isStartFailure(error)) throw error;
		return { ...plan, outcome: { error: error.message } };
	}
};

// A person asks for the manager of the project that `project` belongs to.
export const prepareRetry = async (ctx: AgentsCtx, input: AgentRetryManagerInput): Promise<ManagerPlan> => {
	requireActor(ctx);
	const projectId = await ctx.newTx(async (tx) => (await resolveProject(ctx, tx, input.project)).id);
	return prepareManager(ctx, { project: projectId });
};

const LIVE = new Set<AgentState>(["starting", "running", "waiting"]);

// A tab the runner started runs a new Claude process, which reports itself
// through agents.register; until then it is `starting`. A tab the runner
// found runs already. A failed start marks the row `failed`, except a row
// whose agent still runs: a runner that cannot answer now does not stop it.
export const recordManager = async (ctx: AgentsCtx, tx: Tx, plan: ManagerPlan): Promise<AgentSession> => {
	const { manager } = plan;
	if ("error" in plan.outcome) {
		if (manager !== null && LIVE.has(manager.state)) return announce(ctx, tx, manager.id);
		if (manager !== null) return failSession(ctx, tx, manager.id, plan.outcome.error);
		const id = newSessionId();
		await insertSession(ctx, tx, {
			id,
			projectId: plan.projectId,
			ticketId: null,
			role: "manager",
			state: "failed",
			workspaceId: null,
			terminalId: null,
			claudeSessionId: null,
			name: await reserveName(tx, plan.projectId),
			title: plan.title,
			openUrl: null,
			error: plan.outcome.error,
		});
		return announce(ctx, tx, id);
	}
	const state = plan.outcome.place.started ? "starting" : "running";
	const { workspaceId, terminalId, openUrl } = plan.outcome.place;
	if (manager !== null) {
		await tx.execute(sql`
			UPDATE agent_sessions SET workspace_id = ${workspaceId}, terminal_id = ${terminalId}, open_url = ${openUrl},
				state = ${state}, error = NULL, updated_at = ${ctx.now}
			WHERE id = ${manager.id}
		`);
		return announce(ctx, tx, manager.id);
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
		name: await reserveName(tx, plan.projectId),
		title: plan.title,
		openUrl,
	});
	return announce(ctx, tx, id);
};
