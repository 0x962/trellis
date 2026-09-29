import { createHash } from "node:crypto";
import type { AgentRunListInput, EpicRefInput } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { decodeCursor, encodeCursor, isIsoTimestamp } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { latestAttemptActivityByRuns } from "../assignments.ts";
import { resolveEpic } from "../epics/resolve.ts";
import { resolveProject, resolveTicket } from "../refs.ts";
import type { ServiceCtx } from "../support.ts";
import { observeRuns } from "./liveState.ts";
import { listColumns, type StoredRun, storedRows } from "./queries.ts";

type Ctx = ServiceCtx & { core: CoreCtx; localUrl: string };

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

const windowStart = (input: AgentRunListInput, cursor: AgentRunCursor | null, now: Date) => {
	if (input.allHistory) return null;
	if (cursor !== null) return cursor.windowStart;
	return new Date(now.getTime() - input.windowHours * 3_600_000).toISOString();
};

const withinWindow = (input: AgentRunListInput, ticketId: string | null, start: string | null) => {
	if (input.ids !== undefined || ticketId !== null) return sql`true`;
	if (start === null) return sql`true`;
	return sql`(closed_at IS NULL OR updated_at >= ${start})`;
};

type AgentRunCursor = {
	format: 1;
	filterHash: string;
	windowStart: string | null;
	pinned: 0 | 1;
	orderedAt: string;
	createdAt: string;
	id: string;
};

const filterHash = (input: AgentRunListInput, ticketId: string | null, projectId: string | null) =>
	createHash("sha1")
		.update(
			JSON.stringify([
				ticketId,
				projectId,
				input.ids,
				input.assigned,
				input.includePinnedHistory,
				input.allHistory,
				input.windowHours,
			]),
		)
		.digest("hex");

const readCursor = (value: string | undefined, hash: string, allHistory: boolean): AgentRunCursor | null => {
	if (value === undefined) return null;
	let parsed: unknown;
	try {
		parsed = decodeCursor(value);
	} catch {
		throw fail("INVALID_CURSOR");
	}
	const cursor = parsed as Partial<AgentRunCursor> | null;
	if (
		cursor === null ||
		cursor.format !== 1 ||
		cursor.filterHash !== hash ||
		(allHistory ? cursor.windowStart !== null : !isIsoTimestamp(cursor.windowStart)) ||
		(cursor.pinned !== 0 && cursor.pinned !== 1) ||
		!isIsoTimestamp(cursor.orderedAt) ||
		!isIsoTimestamp(cursor.createdAt) ||
		typeof cursor.id !== "string"
	)
		throw fail("INVALID_CURSOR");
	return cursor as AgentRunCursor;
};

const afterCursor = (input: AgentRunListInput, cursor: AgentRunCursor | null): SQL => {
	if (cursor === null) return sql`true`;
	if (!input.includePinnedHistory) return sql`(updated_at, id) < (${cursor.orderedAt}::timestamptz, ${cursor.id})`;
	return sql`(
		CASE WHEN pinned_at IS NULL THEN 0 ELSE 1 END,
		COALESCE(pinned_at, created_at),
		created_at,
		id
	) < (${cursor.pinned}::int, ${cursor.orderedAt}::timestamptz, ${cursor.createdAt}::timestamptz, ${cursor.id})`;
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
	const hash = filterHash(input, ticket?.id ?? null, project?.id ?? null);
	const cursor = readCursor(input.cursor, hash, input.allHistory);
	const start = windowStart(input, cursor, ctx.now);
	const window = withinWindow(input, ticket?.id ?? null, start);
	const history = input.includePinnedHistory
		? sql`kind IN ('agent', 'session') AND (pinned_at IS NOT NULL OR ${window})`
		: window;
	const cursorWhere = afterCursor(input, cursor);
	const order = input.includePinnedHistory
		? sql`CASE WHEN pinned_at IS NULL THEN 0 ELSE 1 END DESC,
			COALESCE(pinned_at, created_at) DESC, created_at DESC, id DESC`
		: sql`updated_at DESC, id DESC`;
	const found = await storedRows<StoredRun>(
		tx,
		sql`SELECT ${listColumns} FROM agent_runs WHERE ${scope} AND ${history} AND ${cursorWhere}
		ORDER BY ${order} LIMIT ${input.limit + 1}`,
	);
	const items = found.slice(0, input.limit);
	const last = items.at(-1);
	return {
		items: await withAttemptActivity(tx, items),
		nextCursor:
			found.length > input.limit && last !== undefined
				? encodeCursor({
						format: 1,
						filterHash: hash,
						windowStart: start,
						pinned: last.pinnedAt === null ? 0 : 1,
						orderedAt: input.includePinnedHistory ? (last.pinnedAt ?? last.createdAt) : last.updatedAt,
						createdAt: last.createdAt,
						id: last.id,
					})
				: null,
	};
};

export const latestByEpicTicket = async (ctx: CoreCtx, tx: Tx, input: EpicRefInput) => {
	const epic = await resolveEpic(ctx, tx, input.epic);
	const runs = await storedRows<StoredRun>(
		tx,
		sql`SELECT ${listColumns} FROM agent_runs WHERE id IN (
			SELECT DISTINCT ON (ticket_id) id FROM agent_runs
			WHERE kind='agent' AND ticket_id IN (SELECT id FROM tickets WHERE epic_id=${epic.id})
			ORDER BY ticket_id, GREATEST(activity_at, closed_at, created_at,
					(SELECT MAX(created_at) FROM agent_execution_attempts WHERE run_id=agent_runs.id)) DESC,
				created_at DESC, id DESC
		) ORDER BY ticket_identifier, id`,
	);
	return withAttemptActivity(tx, runs);
};

export const prepareList = async (ctx: Ctx, input: AgentRunListInput) => {
	const page = await ctx.newTx((tx) => list(ctx.core, tx, input));
	return { ...page, items: await observeRuns(ctx, page.items) };
};

export const prepareLatestByEpicTicket = async (ctx: Ctx, input: EpicRefInput) =>
	observeRuns(ctx, await ctx.newTx((tx) => latestByEpicTicket(ctx.core, tx, input)));
