import { type AgentSession, agentTitle, restartText } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { AgentPlace } from "../agents/runner.ts";
import { textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import {
	type AgentsCtx,
	announce,
	type Block,
	blockSession,
	clearBlock,
	insertSession,
	LIVE_STATES,
	newSessionId,
	selectSessions,
} from "./agentSessions.ts";
import { managedProject, readAgentSettings } from "./agentSettings.ts";
import { effectiveRepos, runnerProjectOf } from "./agentStart.ts";
import { managerOf } from "./agentWake.ts";
import { effectiveTrustedRoots } from "./projectsTrustedFolders.ts";
import { pathOf } from "./refs.ts";

// The two services the agents host runs at its start, as the system actor.
// Neither is on the API.

// `exited` names every session whose terminal is gone. `silent` names the
// ones among them that never called agents.register, so they did no work
// and said nothing.
export type ReconcilePlan = { exited: string[]; silent: string[] };

// A session holds its terminal only while the runner lists that terminal as
// running. The runner lists each workspace once.
export const prepareReconcile = async (ctx: AgentsCtx): Promise<ReconcilePlan> => {
	const live = await ctx.newTx((tx) =>
		selectSessions(tx, sql`s.state IN ${LIVE_STATES} AND s.workspace_id IS NOT NULL AND s.terminal_id IS NOT NULL`),
	);
	const plan: ReconcilePlan = { exited: [], silent: [] };
	for (const workspaceId of new Set(live.map((session) => session.workspaceId!))) {
		const tabs = await ctx.runner.terminals(workspaceId);
		for (const session of live.filter((found) => found.workspaceId === workspaceId)) {
			const tab = tabs.find((found) => found.terminalId === session.terminalId);
			if (tab !== undefined && !tab.exited) continue;
			plan.exited.push(session.id);
			if (session.claudeSessionId === null) plan.silent.push(session.id);
		}
	}
	return plan;
};

// An agent that ran a turn and then exited ended its work, and the state
// alone says so. An agent that never called agents.register did no work,
// so its row carries the reason and the project header stops reading Off.
export const reconcile = async (ctx: AgentsCtx, tx: Tx, plan: ReconcilePlan) => {
	if (plan.exited.length > 0) {
		await tx.execute(
			sql`UPDATE agent_sessions SET state = 'exited', updated_at = ${ctx.now} WHERE id = ANY(${textArray(plan.exited)})`,
		);
	}
	for (const id of plan.silent) await blockSession(ctx, tx, id, { reason: "terminal-exited" });
	for (const id of plan.exited) await announce(ctx, tx, id);
	return { exited: plan.exited.length };
};

// The plan of one ensureManager. `place` is absent when the runner refused
// the start; `block` then says what a human must fix.
export type ManagerPlan = {
	projectId: string;
	managerId: string | null;
	title: string;
	place?: AgentPlace & { started: boolean };
	block: Block | null;
};

// The newest manager row of a project in any state. A start that failed
// writes its reason onto this row, so a project keeps one manager to read
// however often the start fails.
const lastManagerRow = async (tx: Tx, projectId: string) =>
	(await selectSessions(tx, sql`s.project_id = ${projectId} AND s.role = 'manager'`)).at(-1);

// The runner finds the manager workspace by its branch. A live manager tab
// stays; an exited manager resumes its Claude session with the restart
// text as its prompt; a project without a manager gets a new one.
//
// The agents host calls this in the background, so a failure that only
// went to the log left the person with a manager badge that read Off and
// no reason. A failure now lands on the manager row instead.
export const prepareManager = async (ctx: AgentsCtx, input: { project: string }): Promise<ManagerPlan> => {
	const found = await ctx.newTx(async (tx) => {
		const managed = managedProject(ctx, await readAgentSettings(tx), input.project);
		const manager = await managerOf(tx, managed.projectId);
		return {
			managed,
			manager,
			last: await lastManagerRow(tx, managed.projectId),
			repos: await effectiveRepos(ctx, tx, managed.projectId),
			trustedRoots: await effectiveTrustedRoots(ctx, tx, managed.projectId),
		};
	});
	const project = pathOf(ctx.cache, found.managed.projectId);
	const title = agentTitle({ role: "manager", project });
	const projectId = found.managed.projectId;
	try {
		const place = await ctx.runner.ensureManager({
			project,
			runnerProjectId: await runnerProjectOf(ctx, found.managed, found.repos),
			baseBranch: found.managed.baseBranch,
			claudeSessionId: found.manager === undefined ? null : found.manager.claudeSessionId,
			text: restartText(project),
			trustedRoots: found.trustedRoots,
		});
		return {
			projectId,
			managerId: found.manager === undefined ? null : found.manager.id,
			title,
			place,
			block: place.trust.rootless ? { reason: "folder-trust" } : null,
		};
	} catch (error) {
		return {
			projectId,
			managerId: found.last === undefined ? null : found.last.id,
			title,
			block: { reason: "runner-error", detail: (error as Error).message },
		};
	}
};

// A tab the runner started runs a new Claude process, which reports itself
// through agents.register; until then it is `starting`. A tab the runner
// found runs already. A start the runner refused leaves the row `exited`
// with the reason on it, and the project has one manager row to read.
export const recordManager = async (ctx: AgentsCtx, tx: Tx, plan: ManagerPlan): Promise<AgentSession> => {
	const state = plan.place === undefined ? "exited" : plan.place.started ? "starting" : "running";
	const workspaceId = plan.place?.workspaceId ?? null;
	const terminalId = plan.place?.terminalId ?? null;
	const openUrl = plan.place?.openUrl ?? null;
	const id = plan.managerId ?? newSessionId();
	if (plan.managerId !== null) {
		await tx.execute(sql`
			UPDATE agent_sessions SET workspace_id = COALESCE(${workspaceId}, workspace_id),
				terminal_id = COALESCE(${terminalId}, terminal_id), open_url = COALESCE(${openUrl}, open_url),
				state = ${state}, updated_at = ${ctx.now}
			WHERE id = ${plan.managerId}
		`);
	} else {
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
	}
	if (plan.block === null) await clearBlock(ctx, tx, id);
	else await blockSession(ctx, tx, id, plan.block);
	return announce(ctx, tx, id);
};
