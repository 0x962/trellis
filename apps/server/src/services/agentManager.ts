import { type AgentFailure, type AgentSession, agentTitle, restartText } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { AgentPlace } from "../agents/runner.ts";
import { asRunnerFailure, runnerUnavailable } from "../agents/runner.ts";
import { textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import {
	type AgentsCtx,
	announce,
	clearedFailure,
	failureColumns,
	insertSession,
	LIVE_STATES,
	newSessionId,
	selectSessions,
} from "./agentSessions.ts";
import { managedProject, readAgentSettings } from "./agentSettings.ts";
import { effectiveRepos, runnerProjectOf } from "./agentStart.ts";
import { managerOf } from "./agentWake.ts";
import { pathOf } from "./refs.ts";

// The two services the agents host runs at its start, as the system actor.
// Neither is on the API.

export type ReconcilePlan = { exited: string[] };

// The states in which a manager row still names an agent that runs. A row in
// one of them keeps its workspace id and its terminal id through a refused
// start.
const LIVE_MANAGER_STATES = new Set(["starting", "running", "waiting"]);

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
	// True when the row `managerId` names still holds a terminal the runner
	// reported and has not ended. A refused start may not overwrite such a
	// row: the agent it names keeps running, and the workspace id and the
	// terminal id are the only handle trellis has on it.
	managerLive: boolean;
	title: string;
	place: (AgentPlace & { started: boolean }) | null;
	failure: AgentFailure | null;
};

// The newest manager row of a project that trellis did not stop. It holds
// the Claude session, the terminal, and any earlier failure, so every start
// of that project's manager writes this one row.
export const managerRowOf = async (tx: Tx, projectId: string) =>
	(await selectSessions(tx, sql`s.project_id = ${projectId} AND s.role = 'manager' AND s.state <> 'stopped'`)).at(-1);

// The runner finds the manager workspace by its branch. A live manager tab
// stays; an exited manager resumes its Claude session with the restart
// text as its prompt; a project without a manager gets a new one. A start
// the runner refuses comes back as `failure`, which the manager row then
// carries, so the reason reaches the person who turned the manager on.
export const prepareManager = async (ctx: AgentsCtx, input: { project: string }): Promise<ManagerPlan> => {
	const found = await ctx.newTx(async (tx) => {
		const managed = managedProject(ctx, await readAgentSettings(tx), input.project);
		return {
			managed,
			row: await managerRowOf(tx, managed.projectId),
			resume: await managerOf(tx, managed.projectId),
			repos: await effectiveRepos(ctx, tx, managed.projectId),
		};
	});
	const project = pathOf(ctx.cache, found.managed.projectId);
	const row = found.row;
	const base = {
		projectId: found.managed.projectId,
		managerId: row === undefined ? null : row.id,
		managerLive:
			row !== undefined && row.workspaceId !== null && row.terminalId !== null && LIVE_MANAGER_STATES.has(row.state),
		title: agentTitle({ role: "manager", project }),
	};
	try {
		const place = await ctx.runner.ensureManager({
			project,
			runnerProjectId: await runnerProjectOf(ctx, found.managed, found.repos),
			baseBranch: found.managed.baseBranch,
			claudeSessionId: found.resume === undefined ? null : found.resume.claudeSessionId,
			text: restartText(project),
		});
		return { ...base, place, failure: null };
	} catch (error) {
		const failure = asRunnerFailure(error);
		if (failure === null) throw error;
		return { ...base, place: null, failure };
	}
};

// A tab the runner started runs a new Claude process, which reports itself
// through agents.register; until then it is `starting`. A tab the runner
// found runs already.
//
// A refused start writes the reason on the manager row and drops the
// workspace and the terminal, because neither exists. A project whose
// manager still holds a terminal keeps that row untouched and the caller
// gets the refusal as an error, so one runner error at a server restart
// cannot take the handle on a manager that runs.
export const recordManager = async (ctx: AgentsCtx, tx: Tx, plan: ManagerPlan): Promise<AgentSession> => {
	if (plan.failure !== null) {
		if (plan.managerLive) throw runnerUnavailable(plan.failure.reason, plan.failure.detail, plan.failure.exitCode);
		if (plan.managerId !== null) {
			await tx.execute(sql`
				UPDATE agent_sessions SET workspace_id = NULL, terminal_id = NULL, open_url = NULL,
					${failureColumns(plan.failure)}, updated_at = ${ctx.now}
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
			state: "failed",
			workspaceId: null,
			terminalId: null,
			claudeSessionId: null,
			title: plan.title,
			openUrl: null,
			failure: plan.failure,
		});
		return announce(ctx, tx, id);
	}
	const state = plan.place!.started ? "starting" : "running";
	const { workspaceId, terminalId, openUrl } = plan.place!;
	if (plan.managerId !== null) {
		await tx.execute(sql`
			UPDATE agent_sessions SET workspace_id = ${workspaceId}, terminal_id = ${terminalId}, open_url = ${openUrl},
				state = ${state}, ${clearedFailure}, updated_at = ${ctx.now}
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
