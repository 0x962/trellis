import type { AgentRun, AgentRunListInput, AgentRunStartInput, TicketGetInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { listExecutionAttempts } from "../assignments.ts";
import { resolveProject, resolveTicket } from "../refs.ts";
import type { ServiceCtx } from "../support.ts";
import { closeExitedAssignments } from "./closeExitedAssignments.ts";
import { observeRuns } from "./liveState.ts";
import { startNative } from "./nativeStart.ts";
import { columns, getRun, type StoredRun } from "./queries.ts";
import { reserve } from "./reserve.ts";
import { aggregateTicketMetrics } from "./ticketMetrics.ts";

type Ctx = ServiceCtx & { core: CoreCtx; localUrl: string };

export const list = async (ctx: CoreCtx, tx: Tx, input: AgentRunListInput) => {
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const project = input.project === undefined ? null : await resolveProject(ctx, tx, input.project);
	return rows<StoredRun>(
		tx,
		sql`SELECT ${columns} FROM agent_runs WHERE
		${ticket === null ? sql`true` : sql`ticket_id = ${ticket.id}`} AND
		${project === null ? sql`true` : sql`project_id = ${project.id}`} ORDER BY created_at DESC, id DESC`,
	);
};

export const prepareList = async (ctx: Ctx, input: AgentRunListInput) => {
	const { runs, attempts } = await ctx.newTx(async (tx) => {
		const runs = await list(ctx.core, tx, input);
		return {
			runs,
			attempts: await listExecutionAttempts(
				tx,
				runs.map((run) => run.id),
			),
		};
	});
	return observeRuns(ctx, runs, attempts);
};

export const observeResult = async (ctx: Ctx, input: { id: string }) => {
	const { run, attempts } = await ctx.newTx(async (tx) => {
		const run = await getRun(tx, input.id);
		return { run, attempts: await listExecutionAttempts(tx, [run.id]) };
	});
	return (await observeRuns(ctx, [run], attempts))[0]!;
};

export const prepareTicketMetrics = async (ctx: Ctx, input: z.infer<typeof TicketGetInputSchema>) => {
	const { ticket, runs, attempts } = await ctx.newTx(async (tx) => {
		const ticket = await resolveTicket(ctx.core, tx, input.ticket);
		const runs = await rows<StoredRun>(
			tx,
			sql`SELECT ${columns} FROM agent_runs WHERE ticket_id = ${ticket.id} ORDER BY created_at DESC, id DESC`,
		);
		return {
			ticket,
			runs,
			attempts: await listExecutionAttempts(
				tx,
				runs.map((run) => run.id),
			),
		};
	});
	const observedRuns = await observeRuns(ctx, runs, attempts);
	return aggregateTicketMetrics(
		observedRuns.map((run) => run.metrics),
		Math.max(0, ctx.now().getTime() - Date.parse(ticket.createdAt)),
	);
};

export const prepareStart = async (ctx: Ctx, input: AgentRunStartInput) => {
	const sessions = await closeExitedAssignments(ctx);
	const exited = sessions.filter((session) => session.status === "exited").map((session) => session.id);
	const reservation = await ctx.newTx((tx) => reserve(ctx.core, tx, input, exited));
	if (reservation.replay) return { id: reservation.run.id };
	const { run, context, config, resume, attempt, previousAttemptId } = reservation;
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	return startNative(ctx, { run, context, config, resume, attempt, previousAttemptId });
};

export const finish = async (ctx: Ctx, _tx: Tx, input: AgentRun) => {
	ctx.emit({ type: "agent-runs.changed", id: input.id });
	return input;
};
