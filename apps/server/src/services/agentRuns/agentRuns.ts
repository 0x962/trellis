import type { AgentRun, AgentRunListInput, AgentRunStartInput, TicketGetInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { listExecutionAttempts } from "../assignments.ts";
import { resolveProject, resolveTicket } from "../refs.ts";
import type { ServiceCtx } from "../support.ts";
import { resolveTicketAge } from "../tickets.ts";
import { closeExitedAssignments } from "./closeExitedAssignments.ts";
import { observeRuns, observeTicketMetrics } from "./liveState.ts";
import { startNative } from "./nativeStart.ts";
import { columns, getRun, type StoredRun } from "./queries.ts";
import { reserve } from "./reserve.ts";
import { aggregateTicketMetrics } from "./ticketMetrics.ts";

type Ctx = ServiceCtx & { core: CoreCtx; localUrl: string };

// The run list and the metrics route use the same ticket filters and order.
const ticketRuns = (ctx: CoreCtx, tx: Tx, ticketId: string, projectId: string | null) =>
	rows<StoredRun>(
		tx,
		sql`SELECT ${columns} FROM agent_runs WHERE
		${ctx.actor?.kind === "agent" ? sql`true` : sql`NOT EXISTS (SELECT 1 FROM manager_delegations WHERE run_id=agent_runs.id)`} AND
		ticket_id = ${ticketId} AND
		${projectId === null ? sql`true` : sql`project_id = ${projectId}`} ORDER BY created_at DESC, id DESC`,
	);

export const list = async (ctx: CoreCtx, tx: Tx, input: AgentRunListInput) => {
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const project = input.project === undefined ? null : await resolveProject(ctx, tx, input.project);
	if (ticket !== null) return ticketRuns(ctx, tx, ticket.id, project?.id ?? null);
	return rows<StoredRun>(
		tx,
		sql`SELECT ${columns} FROM agent_runs WHERE
		${ctx.actor?.kind === "agent" ? sql`true` : sql`NOT EXISTS (SELECT 1 FROM manager_delegations WHERE run_id=agent_runs.id)`} AND
		${project === null ? sql`true` : sql`project_id = ${project.id}`} ORDER BY created_at DESC, id DESC`,
	);
};

export const prepareList = async (ctx: Ctx, input: AgentRunListInput) =>
	observeRuns(ctx, await ctx.newTx((tx) => list(ctx.core, tx, input)));

export const observeResult = async (ctx: Ctx, input: { id: string }) =>
	(await observeRuns(ctx, [await ctx.newTx((tx) => getRun(tx, input.id))]))[0]!;

export const prepareTicketMetrics = async (ctx: Ctx, input: z.infer<typeof TicketGetInputSchema>) => {
	const { scope, runs, attempts } = await ctx.newTx(async (tx) => {
		const scope = await resolveTicketAge(ctx.core, tx, input.ticket);
		const runs = await ticketRuns(ctx.core, tx, scope.id, null);
		return {
			scope,
			runs,
			attempts: await listExecutionAttempts(
				tx,
				runs.map((run) => run.id),
			),
		};
	});
	return aggregateTicketMetrics(await observeTicketMetrics(ctx, runs, attempts), scope.ageMs);
};

export const prepareStart = async (ctx: Ctx, input: AgentRunStartInput) => {
	const sessions = await closeExitedAssignments(ctx);
	const exited = sessions.filter((session) => session.status === "exited").map((session) => session.id);
	const reservation = await ctx.newTx((tx) => reserve(ctx.core, tx, input, exited));
	if (reservation.replay) return { id: reservation.run.id };
	const { run, context, config, resume, attempt, previousAttemptId, previousAccountId } = reservation;
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	return startNative(ctx, { run, context, config, resume, attempt, previousAttemptId, previousAccountId });
};

export const finish = async (ctx: Ctx, _tx: Tx, input: AgentRun) => {
	ctx.emit({ type: "agent-runs.changed", id: input.id });
	return input;
};
