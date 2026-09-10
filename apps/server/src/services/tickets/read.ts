import {
	BoardQuerySchema,
	CountsQuerySchema,
	ListQuerySchema,
	StatusRefSchema,
	type Ticket,
	TicketGetInputSchema,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { z } from "zod";
import type { ServiceCtx } from "../../context.ts";
import { board } from "../../db/queries/board.ts";
import { counts } from "../../db/queries/counts.ts";
import { rows } from "../../db/queries/support.ts";
import type { TicketFilter } from "../../db/queries/ticketFilters.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import { InvalidCursorError, ticketList } from "../../db/queries/ticketList.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { resolveProject, resolveTicket } from "../refs.ts";

type Query = z.infer<typeof BoardQuerySchema>;

// The status ids a list of status refs names, across every status set. A
// ref that names nothing narrows the list to no rows, which is the answer
// for a status that does not exist.
const statusIdsOf = async (tx: Tx, refs: string[]) => {
	const tests: SQL[] = refs.map((ref) => {
		const parsed = StatusRefSchema.parse(ref);
		if (parsed.kind === "ulid") return sql`s.id = ${parsed.id}`;
		if (parsed.kind === "category") return sql`s.category = ${parsed.category}`;
		const value = parsed.value.toLowerCase();
		return sql`(s.slug = ${value} OR lower(s.name) = ${value})`;
	});
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT s.id FROM statuses s WHERE ${sql.join(tests, sql` OR `)} ORDER BY s.position, s.id`,
	);
	return found.map((row) => row.id);
};

// The flat query grammar with every ref resolved to ids. `project` becomes
// the subtree, or the one project when `subprojects` is false. The project
// cache gives the subtree and the root with no statement. The root lets the
// query use the partial indexes of tickets, which start with root_id.
const toFilter = async (ctx: ServiceCtx, tx: Tx, query: Query) => {
	const filter: TicketFilter = {};
	let projectId: string | null = null;
	if (query.project !== undefined) {
		const project = await resolveProject(ctx, tx, query.project);
		projectId = project.id;
		filter.rootIds = [project.rootId];
		filter.projectIds = query.subprojects ? ctx.cache.resolveSubtree(projectId) : [projectId];
	}
	if (query.status !== undefined) filter.statusIds = await statusIdsOf(tx, query.status);
	if (query.category !== undefined) filter.categories = query.category;
	if (query.reviewer !== undefined) filter.reviewer = query.reviewer;
	if (query.priority !== undefined) filter.priority = query.priority;
	if (query.parent !== undefined) {
		filter.parent = query.parent === "none" ? "none" : (await resolveTicket(ctx, tx, query.parent)).id;
	}
	if (query.pr !== undefined) filter.pr = query.pr;
	if (query.ci !== undefined) filter.ci = query.ci;
	if (query.actor !== undefined) filter.actor = query.actor;
	if (query.q !== undefined) filter.q = query.q;
	if (query.updated !== undefined) filter.updated = query.updated;
	if (query.created !== undefined) filter.created = query.created;
	if (query.completed !== undefined) filter.completed = query.completed;
	return { filter, projectId };
};

// The columns of a board or a count: the effective statuses of the project,
// or every status when the query names no project. The project cache holds
// every status set, so a project's columns cost no statement.
const columnStatusIds = async (ctx: ServiceCtx, tx: Tx, projectId: string | null) => {
	if (projectId !== null) return ctx.cache.effectiveStatuses(projectId).statuses.map((status) => status.id);
	const found = await rows<{ id: string }>(tx, sql`SELECT id FROM statuses ORDER BY position, id`);
	return found.map((row) => row.id);
};

// A cursor is user input. One that belongs to another filter or sort is
// refused, so a client never reads a page of the wrong list.
export const list = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const query = ListQuerySchema.parse(rawInput);
	const { filter } = await toFilter(ctx, tx, query);
	try {
		return await ticketList(tx, { ...filter, sort: query.sort, cursor: query.cursor, limit: query.limit });
	} catch (error) {
		if (error instanceof InvalidCursorError) throw fail("INVALID_CURSOR");
		throw error;
	}
};

// The columns of a board or a count, cut to the `status` filter when the
// query names one. The column ids stand in for the status filter in the
// query, so a status outside the filter gets no column and no count.
const columnsOf = async (ctx: ServiceCtx, tx: Tx, projectId: string | null, filter: TicketFilter) => {
	const columns = await columnStatusIds(ctx, tx, projectId);
	const wanted = filter.statusIds;
	return wanted === undefined ? columns : columns.filter((id) => wanted.includes(id));
};

export const boardOf = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const query = BoardQuerySchema.parse(rawInput);
	const { filter, projectId } = await toFilter(ctx, tx, query);
	return board(tx, { ...filter, statusIds: await columnsOf(ctx, tx, projectId, filter) });
};

export const countsOf = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const query = CountsQuerySchema.parse(rawInput);
	const { filter, projectId } = await toFilter(ctx, tx, query);
	return counts(tx, { ...filter, statusIds: await columnsOf(ctx, tx, projectId, filter) });
};

export const get = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketGetInputSchema.parse(rawInput);
	const row = await resolveTicket(ctx, tx, input.ticket);
	return ticketGet(tx, row.id);
};
