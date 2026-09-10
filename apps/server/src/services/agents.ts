import { type AgentRegisterInput, type AgentSession, type AgentSessionsInput, agentTitle } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import {
	type AgentsCtx,
	announce,
	clearBlock,
	insertSession,
	LIVE_STATES,
	newSessionId,
	selectSessions,
	sessionById,
	toSession,
} from "./agentSessions.ts";
import { readAgentSettings } from "./agentSettings.ts";
import { pathOf, resolveProject, resolveTicket } from "./refs.ts";

export { prepareUnblock, unblock } from "./agentBlocked.ts";
export { inbox } from "./agentInbox.ts";
export { prepareManager, prepareReconcile, reconcile, recordManager } from "./agentManager.ts";
export { prepareRunnerProjects, runnerProjects } from "./agentRunnerProjects.ts";
export { get as settings, set as setSettings } from "./agentSettings.ts";
export { prepareStalled, stalled } from "./agentStalled.ts";
export { prepareBuilder, prepareReviewer, startBuilder, startReviewer } from "./agentStart.ts";
export { prepareTrustBackfill, trustBackfill } from "./agentTrustBackfill.ts";
export { prepareWake, wake } from "./agentWake.ts";

// The sessions of one project, or of one ticket, oldest first.
export const sessions = async (ctx: ServiceCtx, tx: Tx, input: AgentSessionsInput) => {
	const where =
		input.project === undefined
			? sql`s.ticket_id = ${(await resolveTicket(ctx, tx, input.ticket as string)).id}`
			: sql`s.project_id = ${(await resolveProject(ctx, tx, input.project)).id}`;
	return { sessions: (await selectSessions(tx, where)).map(toSession) };
};

// A running agent reports its terminal and its Claude session. The row of
// that terminal takes the new Claude session; a terminal without a row gets
// a new one. A new manager replaces the live manager of its project, which
// becomes `exited`, because a project has one live manager.
export const register = async (ctx: ServiceCtx, tx: Tx, input: AgentRegisterInput): Promise<AgentSession> => {
	requireActor(ctx);
	const project = await resolveProject(ctx, tx, input.project);
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const [held] = await selectSessions(
		tx,
		sql`s.workspace_id = ${input.workspaceId} AND s.terminal_id = ${input.terminalId}`,
	);
	if (held !== undefined) {
		await tx.execute(sql`
			UPDATE agent_sessions SET claude_session_id = ${input.claudeSessionId}, state = 'running', updated_at = ${ctx.now}
			WHERE id = ${held.id}
		`);
		// The agent runs its first turn, so whatever stopped it before is
		// over and the web shows no reason any more.
		await clearBlock(ctx, tx, held.id);
		return announce(ctx, tx, held.id);
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
	const { session, remove } = await ctx.newTx(async (tx) => {
		const found = await sessionById(tx, input.id);
		return { session: found, remove: await removesWorkspace(tx, found) };
	});
	if (session.state === "stopped") return { id: session.id, changed: false, removed: null };
	if (session.workspaceId !== null && session.terminalId !== null) {
		await ctx.runner.stop({ workspaceId: session.workspaceId, terminalId: session.terminalId });
	}
	if (remove && session.workspaceId !== null) await ctx.runner.removeWorkspace(session.workspaceId);
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
