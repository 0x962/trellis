import {
	AGENT_RUN_LIST_MAX_LIMIT,
	AGENT_RUN_LIST_WINDOW_HOURS,
	type AgentRun,
	type AgentRunListInput,
	type AgentRunStartInput,
	type TicketGetInputSchema,
} from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { latestAttemptActivityByRuns, listExecutionAttempts } from "../assignments.ts";
import { resolveProject, resolveTicket } from "../refs.ts";
import type { IoCtx, ServiceCtx } from "../support.ts";
import { resolveTicketAge } from "../tickets.ts";
import { closeExitedAssignments } from "./closeExitedAssignments.ts";
import { launchRun } from "./launchRun";
import { launchState } from "./launchState";
import { observeRuns, observeTicketMetrics, projectRun } from "./liveState.ts";
import { startNative } from "./nativeStart.ts";
import { getRun, listColumns, type StoredRun, storedRows } from "./queries.ts";
import { reserve } from "./reserve.ts";
import { aggregateTicketMetrics } from "./ticketMetrics.ts";

type Ctx = ServiceCtx & { core: CoreCtx; localUrl: string };

// The run list and the metrics route use the same ticket filters and order.
const ticketRuns = (_ctx: CoreCtx, tx: Tx, ticketId: string, projectId: string | null) =>
	storedRows<StoredRun>(
		tx,
		sql`SELECT ${listColumns} FROM agent_runs WHERE ticket_id = ${ticketId} AND
		${projectId === null ? sql`true` : sql`project_id = ${projectId}`} ORDER BY created_at DESC, id DESC`,
	);

const withAttemptActivity = async (tx: Tx, runs: StoredRun[]) => {
	const attempts = new Map(
		(
			await latestAttemptActivityByRuns(
				tx,
				runs.map((run) => run.id),
			)
		).map((attempt) => [attempt.runId, attempt.activityAt]),
	);
	return runs.map((run) => {
		const attemptAt = attempts.get(run.id);
		return attemptAt !== undefined && (run.activityAt === null || attemptAt > run.activityAt)
			? { ...run, activityAt: attemptAt }
			: run;
	});
};

// The window keeps every open run. It also keeps each closed run whose
// `updated_at` value falls inside `windowHours`. A caller that names `ids`
// or `ticket` already asks for a bounded set.
const withinWindow = (input: AgentRunListInput, ticketId: string | null, now: Date) => {
	if (input.ids !== undefined || ticketId !== null) return sql`true`;
	const start = new Date(now.getTime() - input.windowHours * 3_600_000);
	return sql`(closed_at IS NULL OR updated_at >= ${start})`;
};

export const list = async (ctx: CoreCtx, tx: Tx, input: AgentRunListInput) => {
	const ticket = input.ticket === undefined ? null : await resolveTicket(ctx, tx, input.ticket);
	const project = input.project === undefined ? null : await resolveProject(ctx, tx, input.project);
	const projectWhere =
		project === null
			? sql`true`
			: sql`((ticket_id IS NULL AND project_id = ${project.id}) OR
				ticket_id IN (SELECT id FROM tickets WHERE project_id = ${project.id}))`;
	const ticketWhere = ticket === null ? sql`true` : sql`ticket_id = ${ticket.id}`;
	const idsWhere =
		input.ids === undefined
			? sql`true`
			: input.ids.length === 0
				? sql`false`
				: sql`id IN (${sql.join(
						input.ids.map((id) => sql`${id}`),
						sql`, `,
					)})`;
	const assignedWhere =
		input.assigned === undefined ? sql`true` : input.assigned ? sql`closed_at IS NULL` : sql`closed_at IS NOT NULL`;
	const scope = sql`${projectWhere} AND ${ticketWhere} AND ${idsWhere} AND ${assignedWhere}`;
	const window = withinWindow(input, ticket === null ? null : ticket.id, ctx.now);
	if (input.includePinnedHistory) {
		const runs = await storedRows<StoredRun>(
			tx,
			sql`WITH pinned AS (
					SELECT ${listColumns} FROM agent_runs
					WHERE ${scope} AND kind IN ('agent', 'session') AND pinned_at IS NOT NULL
				), recent AS (
					SELECT ${listColumns} FROM agent_runs
					WHERE ${scope} AND kind IN ('agent', 'session') AND pinned_at IS NULL AND ${window}
					ORDER BY updated_at DESC, id DESC LIMIT ${input.limit}
				)
				SELECT * FROM pinned
				UNION ALL
				SELECT * FROM recent
				ORDER BY "pinnedAt" DESC NULLS LAST, "createdAt" DESC, id DESC`,
		);
		return withAttemptActivity(tx, runs);
	}
	const runs = await storedRows<StoredRun>(
		tx,
		sql`SELECT ${listColumns} FROM agent_runs WHERE ${scope} AND ${window}
		ORDER BY updated_at DESC, id DESC LIMIT ${input.limit}`,
	);
	return withAttemptActivity(tx, runs);
};

const projectUnresolvedAttempts = (runs: StoredRun[], sessions: RuntimeProcessStatus[], home?: string) =>
	runs
		.map((run) => projectRun(run, sessions, home))
		.filter((run) => ["interrupted", "failed"].includes(run.state))
		.map(({ id, state, error }) => ({ id, state, error }));

export const listUnresolvedAttempts = async (tx: Tx, input: { sessions: RuntimeProcessStatus[]; home: string }) => {
	const runs = await storedRows<StoredRun>(
		tx,
		sql`SELECT ${listColumns} FROM agent_runs WHERE runtime='native' ORDER BY updated_at DESC LIMIT 100`,
	);
	return projectUnresolvedAttempts(runs, input.sessions, input.home);
};

export const prepareList = async (ctx: Ctx, input: AgentRunListInput) =>
	observeRuns(ctx, await ctx.newTx((tx) => list(ctx.core, tx, input)));

// Every run that a ticket or a session still holds. The list route caps how
// many rows it answers with, and a reader of the open set must see all of
// them, so this asks for the largest answer the list gives.
export const prepareOpenRuns = (ctx: Ctx) =>
	prepareList(ctx, {
		assigned: true,
		includePinnedHistory: false,
		windowHours: AGENT_RUN_LIST_WINDOW_HOURS,
		limit: AGENT_RUN_LIST_MAX_LIMIT,
	});

export const observeResult = async (ctx: Ctx, input: { id: string }) =>
	(await observeRuns(ctx, [await ctx.newTx((tx) => getRun(tx, input.id))]))[0]!;

export const acceptedResult = async (ctx: Ctx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.terminalId !== null && launchState.has(ctx.home, run.terminalId)) return projectRun(run, [], ctx.home);
	return observeResult(ctx, input);
};

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

export const prepareStart = async (ctx: IoCtx, input: AgentRunStartInput, start = startNative) => {
	const sessions = input.ticket === undefined ? await closeExitedAssignments(ctx) : [];
	const exited = sessions.filter((session) => session.status === "exited").map((session) => session.id);
	const reservation = await ctx.newTx((tx) => reserve(ctx.core, tx, input, exited));
	if (reservation.replay) return { id: reservation.run.id };
	const { run, config, resume, attempt, previousAttemptId, previousAccountId } = reservation;
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	const launch = {
		run,
		config,
		resume,
		attempt,
		previousAttemptId,
		previousAccountId,
		preserveAssignmentOnFailure: run.kind === "agent",
	};
	if (run.kind === "agent") {
		launchRun(ctx, run.id, attempt.id, (background) => start(background, launch));
		return { id: run.id };
	}
	return start(ctx, launch);
};

export const finish = async (ctx: Ctx, _tx: Tx, input: AgentRun) => {
	ctx.emit({ type: "agent-runs.changed", id: input.id });
	return input;
};
