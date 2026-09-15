import { type AgentRetryManagerInput, type AgentSession, type AgentState, agentTitle, restartText } from "@trellis/api";
import { sql } from "drizzle-orm";
import { type AgentPlace, isStartFailure, runnerUnavailable } from "../agents/runner.ts";
import { attempt } from "../agents/superset/attempt.ts";
import { requireActor } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { retirementOf } from "./agentRuns/externalRetirement/retirementOf.ts";
import {
	type AgentsCtx,
	announce,
	failSession,
	insertSession,
	LIVE_STATES,
	managerOf,
	newSessionId,
	reserveName,
	type SessionRow,
	selectSessions,
} from "./agentSessions.ts";
import { hostOf, managedProject, readAgentSettings } from "./agentSettings.ts";
import { baseBranchOf, effectiveRepos, runnerProjectOf } from "./agentStart.ts";
import { managerConfigOf, projectRow } from "./projectRows.ts";
import { pathOf, resolveProject } from "./refs.ts";

// The services that start a project's manager: the agents host runs
// reconcile and ensureManager as the system actor, and a person runs
// retryManager through the API.

type Observation = { session: SessionRow; state: AgentState; error: string | null };
export type ReconcilePlan = { observations: Observation[] };

export const prepareReconcile = async (ctx: AgentsCtx): Promise<ReconcilePlan> => {
	const { live, settings } = await ctx.newTx(async (tx) => ({
		live: await selectSessions(
			tx,
			sql`s.state IN ${LIVE_STATES} AND s.workspace_id IS NOT NULL AND s.terminal_id IS NOT NULL`,
		),
		settings: await readAgentSettings(tx),
	}));
	const observations: Observation[] = [];
	for (const projectId of new Set(live.map((session) => session.projectId))) {
		const project = live.filter((session) => session.projectId === projectId);
		for (const workspaceId of new Set(project.map((session) => session.workspaceId!))) {
			const result = await attempt(() => ctx.runner.terminals(workspaceId, hostOf(settings, projectId)));
			for (const session of project.filter((found) => found.workspaceId === workspaceId)) {
				const tab = result.ok ? result.value.find((found) => found.terminalId === session.terminalId) : undefined;
				if (!tab)
					observations.push({
						session,
						state: "waiting",
						error: `External session unavailable: ${result.ok ? `Terminal ${session.terminalId} is missing from workspace ${workspaceId}.` : result.error} Its process exit is unconfirmed.`,
					});
				else if (tab.exited) observations.push({ session, state: "exited", error: null });
				else if (
					(session.state === "starting" && tab.title === session.title) ||
					session.error?.startsWith("External session unavailable:")
				)
					observations.push({ session, state: "running", error: null });
			}
		}
	}
	return { observations };
};

export const reconcile = async (ctx: AgentsCtx, tx: Tx, plan: ReconcilePlan) => {
	let exited = 0;
	for (const { session, state, error } of plan.observations) {
		const changed = await rows<{ id: string }>(
			tx,
			sql`UPDATE agent_sessions SET state=${state}, error=${error}, updated_at=${ctx.now}
			WHERE id=${session.id} AND state=${session.state} AND workspace_id IS NOT DISTINCT FROM ${session.workspaceId} AND terminal_id IS NOT DISTINCT FROM ${session.terminalId} AND claude_session_id IS NOT DISTINCT FROM ${session.claudeSessionId}
			RETURNING id`,
		);
		if (changed.length) {
			if (state === "exited") exited++;
			await announce(ctx, tx, session.id);
		}
	}
	return { exited };
};

// `manager` is the row the start writes to, or null for a new row. The
// outcome is the runner's place for the manager, or the message of the
// runner failure.
export type ManagerPlan = {
	projectId: string;
	manager: { id: string; state: AgentState; terminalId: string | null } | null;
	title: string;
	outcome: { place: AgentPlace & { started: boolean } } | { error: string };
};

// A failed start that never got a workspace. The next start writes to this
// row, so failed starts leave one manager row per project.
const failedManagerOf = async (tx: Tx, projectId: string) =>
	(
		await selectSessions(
			tx,
			sql`s.project_id = ${projectId} AND s.role = 'manager' AND s.state = 'failed' AND s.workspace_id IS NULL AND NOT EXISTS (SELECT 1 FROM activity a WHERE a.action='agent.external-retired' AND a.meta->'retirement'->>'source'='legacy' AND a.meta->'retirement'->>'id'=s.id)`,
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
		const config = managerConfigOf(await projectRow(tx, managed.projectId));
		return { managed, manager, config, repos: await effectiveRepos(ctx, tx, managed.projectId) };
	});
	const project = pathOf(ctx.cache, found.managed.projectId);
	if (found.manager?.error?.startsWith("External session unavailable:"))
		throw runnerUnavailable(
			"error",
			"The external manager is unavailable. Refresh or retire its assignment before you start a replacement.",
		);
	if (found.config.personaId !== null)
		throw runnerUnavailable("disabled", `${project} uses its selected manager persona.`);
	const plan = {
		projectId: found.managed.projectId,
		manager:
			found.manager === undefined
				? null
				: { id: found.manager.id, state: found.manager.state, terminalId: found.manager.terminalId },
		title: agentTitle({ role: "manager", project }),
	};
	try {
		const runnerProjectId = await runnerProjectOf(ctx, found.managed, found.repos);
		const place = await ctx.runner.ensureManager({
			project,
			runnerProjectId,
			host: found.managed.supersetHostId,
			baseBranch: await baseBranchOf(ctx, found.managed, runnerProjectId),
			terminalId: found.manager?.terminalId ?? null,
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
	if (manager && (await retirementOf(tx, "legacy", manager.id))) return announce(ctx, tx, manager.id);
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
