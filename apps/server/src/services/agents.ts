import { type AgentRegisterInput, type AgentSession, type AgentSessionsInput, agentTitle } from "@trellis/api";
import { sql } from "drizzle-orm";
import { terminalTitleMatches } from "../agents/runner.ts";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import {
	type AgentsCtx,
	announce,
	insertSession,
	LIVE_STATES,
	newSessionId,
	reserveName,
	selectSessions,
	sessionById,
	toSession,
} from "./agentSessions.ts";
import { hostOf, readAgentSettings } from "./agentSettings.ts";
import { pathOf, resolveProject, resolveTicket } from "./refs.ts";

export { inbox } from "./agentInbox.ts";
export { prepareManager, prepareReconcile, prepareRetry, reconcile, recordManager } from "./agentManager.ts";
export { overview } from "./agentOverview.ts";
export { prepareRunnerHosts, runnerHosts } from "./agentRunnerHosts.ts";
export { prepareRunnerProjects, runnerProjects } from "./agentRunnerProjects.ts";
export { get as settings, set as setSettings } from "./agentSettings.ts";
export { prepareBuilder, prepareReviewer, startBuilder, startReviewer } from "./agentStart.ts";
export { prepareWake, wake } from "./agentWake.ts";

// The sessions of one project, or of one ticket, oldest first.
export const sessions = async (ctx: ServiceCtx, tx: Tx, input: AgentSessionsInput) => {
	const where =
		input.project === undefined
			? sql`s.ticket_id = ${(await resolveTicket(ctx, tx, input.ticket as string)).id}`
			: sql`s.project_id = ${(await resolveProject(ctx, tx, input.project)).id}`;
	return { sessions: (await selectSessions(tx, where)).map(toSession) };
};

// A running agent reports its terminal and its Claude session. One agent
// keeps one row: the row of that terminal, or else the row that trellis
// started for this agent in the same workspace and that no agent claimed,
// takes the terminal, the Claude session, and the running state. A row with
// a Claude session belongs to another agent process, so it stays. Only an
// agent without a row gets a new one. A new manager replaces the live
// manager of its project, which becomes `exited`, because a project has one
// live manager.
export const register = async (ctx: ServiceCtx, tx: Tx, input: AgentRegisterInput): Promise<AgentSession> => {
	requireActor(ctx);
	const project = await resolveProject(ctx, tx, input.project);
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const [held] = await selectSessions(
		tx,
		sql`s.workspace_id = ${input.workspaceId} AND s.terminal_id = ${input.terminalId}`,
	);
	const unclaimed = (
		await selectSessions(
			tx,
			sql`s.workspace_id = ${input.workspaceId} AND s.role = ${input.role} AND s.project_id = ${project.id}
				AND ${ticket === null ? sql`s.ticket_id IS NULL` : sql`s.ticket_id = ${ticket.id}`}
				AND s.claude_session_id IS NULL AND s.state <> 'stopped'`,
		)
	).at(-1);
	const mine = held ?? unclaimed;
	if (mine !== undefined) {
		await tx.execute(sql`
			UPDATE agent_sessions SET terminal_id = ${input.terminalId}, claude_session_id = ${input.claudeSessionId},
				state = 'running', error = NULL, updated_at = ${ctx.now}
			WHERE id = ${mine.id}
		`);
		return announce(ctx, tx, mine.id);
	}
	const replaced =
		input.role === "manager"
			? await rows<{ id: string }>(
					tx,
					sql`UPDATE agent_sessions SET state = 'exited', updated_at = ${ctx.now}
						WHERE project_id = ${project.id} AND role = 'manager' AND state IN ${LIVE_STATES}
						RETURNING id`,
				)
			: [];
	const title =
		ticket === null
			? agentTitle({ role: "manager", project: pathOf(ctx.cache, project.id) })
			: input.role === "builder"
				? ticket.identifier
				: agentTitle({ role: "reviewer", ticket: ticket.identifier });
	const id = newSessionId();
	await insertSession(ctx, tx, {
		id,
		projectId: project.id,
		ticketId: ticket === null ? null : ticket.id,
		role: input.role,
		state: "running",
		workspaceId: input.workspaceId,
		terminalId: input.terminalId,
		claudeSessionId: input.claudeSessionId,
		name: await reserveName(tx, project.id),
		title,
		openUrl: null,
	});
	for (const row of replaced) await announce(ctx, tx, row.id);
	return announce(ctx, tx, id);
};

// `removed` names the workspace the runner deleted, whose other sessions
// stop with this one.
export type StopPlan = { id: string; changed: boolean; removed: string | null };

// A done or canceled ticket needs its builder's checkout no more, so with
// removeWorkspaceOnDone the stop of that builder deletes the workspace.
// The branch stays either way.
const removesWorkspace = async (tx: Tx, session: { role: string; ticketId: string | null; projectId: string }) => {
	if (session.role !== "builder" || session.ticketId === null) return false;
	const [ticket] = await rows<{ category: string }>(
		tx,
		sql`SELECT st.category FROM tickets t JOIN statuses st ON st.id = t.status_id WHERE t.id = ${session.ticketId}`,
	);
	const row = (await readAgentSettings(tx)).projects.find((found) => found.projectId === session.projectId);
	return ["done", "canceled"].includes(ticket!.category) && row?.removeWorkspaceOnDone === true;
};

// A stopped session stays as it is and the runner is not called.
export const prepareStop = async (ctx: AgentsCtx, input: { id: string }): Promise<StopPlan> => {
	requireActor(ctx);
	const { session, remove, host } = await ctx.newTx(async (tx) => {
		const found = await sessionById(tx, input.id);
		return {
			session: found,
			remove: await removesWorkspace(tx, found),
			host: hostOf(await readAgentSettings(tx), found.projectId),
		};
	});
	if (session.state === "stopped") return { id: session.id, changed: false, removed: null };
	if (session.workspaceId !== null && session.terminalId !== null) {
		const terminalIds =
			session.role === "manager"
				? [
						...new Set([
							session.terminalId,
							...(await ctx.runner.terminals(session.workspaceId, host))
								.filter((terminal) => terminalTitleMatches(terminal.title, session.title))
								.map((terminal) => terminal.terminalId),
						]),
					]
				: [session.terminalId];
		for (const terminalId of terminalIds) {
			await ctx.runner.stop({ workspaceId: session.workspaceId, terminalId, host });
		}
	}
	if (remove && session.workspaceId !== null) await ctx.runner.removeWorkspace(session.workspaceId, host);
	return { id: session.id, changed: true, removed: remove ? session.workspaceId : null };
};

export const stop = async (ctx: AgentsCtx, tx: Tx, plan: StopPlan): Promise<AgentSession> => {
	if (!plan.changed) return toSession(await sessionById(tx, plan.id));
	const others =
		plan.removed === null
			? []
			: (
					await rows<{ id: string }>(
						tx,
						sql`SELECT id FROM agent_sessions WHERE workspace_id = ${plan.removed} AND id <> ${plan.id} AND state <> 'stopped'`,
					)
				).map((row) => row.id);
	await tx.execute(
		sql`UPDATE agent_sessions SET state = 'stopped', updated_at = ${ctx.now} WHERE id = ANY(${textArray([plan.id, ...others])})`,
	);
	for (const id of others) await announce(ctx, tx, id);
	return announce(ctx, tx, plan.id);
};
