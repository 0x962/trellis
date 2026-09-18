import {
	BoardQuerySchema,
	CountsQuerySchema,
	ListQuerySchema,
	StatusRefSchema,
	type Ticket,
	TicketGetInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { ServiceCtx } from "../../context.ts";
import { board } from "../../db/queries/board.ts";
import { counts } from "../../db/queries/counts.ts";
import { rows } from "../../db/queries/support.ts";
import type { TicketFilter } from "../../db/queries/ticketFilters.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import { InvalidCursorError, ticketList } from "../../db/queries/ticketList.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { resolveEpic } from "../epics/resolve.ts";
import { labelFilterIds } from "../labelRefs.ts";
import { resolveProject, resolveTicket, toSummary } from "../refs.ts";

type Query = z.infer<typeof BoardQuerySchema>;

type StatusLike = { id: string; slug: string; name: string; category: string };

// True when a status ref names this status. `category:x` names every status
// of that category, because a list filter keeps all of them.
const namesStatus = (status: StatusLike, ref: z.infer<typeof StatusRefSchema>) => {
	if (ref.kind === "ulid") return status.id === ref.id;
	if (ref.kind === "category") return status.category === ref.category;
	const value = ref.value.toLowerCase();
	return status.slug === value || status.name.toLowerCase() === value;
};

// The status ids a list of status refs names. With a project, every ref
// must name a status of the project's effective set, as a create or a move
// requires. Without one, every ref must name a status of some set. A ref
// that names nothing is refused, so a typo never reads as an empty list.
const statusIdsOf = async (ctx: ServiceCtx, tx: Tx, refs: string[], projectId: string | null) => {
	const candidates: StatusLike[] =
		projectId === null
			? await rows<StatusLike>(tx, sql`SELECT id, slug, name, category FROM statuses ORDER BY position, id`)
			: ctx.cache.effectiveStatuses(projectId).statuses;
	const ids = refs.flatMap((raw) => {
		const parsed = StatusRefSchema.safeParse(raw);
		const found = parsed.success ? candidates.filter((status) => namesStatus(status, parsed.data)) : [];
		if (found.length > 0) return found.map((status) => status.id);
		if (projectId === null) throw invalidInput("status", `No status matches "${raw}".`);
		throw fail("STATUS_NOT_IN_PROJECT", { valid: ctx.cache.effectiveStatuses(projectId).statuses.map(toSummary) });
	});
	return [...new Set(ids)];
};

// The flat query grammar with every ref resolved to ids. `project` becomes
// the subtree, or the one project when `subprojects` is false. The project
// cache gives the subtree and the root with no statement. The root lets the
// query use the partial indexes of tickets, which start with root_id.
const toFilter = async (ctx: ServiceCtx, tx: Tx, query: Query) => {
	const filter: TicketFilter = {};
	let projectId: string | null = null;
	let rootId: string | null = null;
	if (query.project !== undefined) {
		const project = await resolveProject(ctx, tx, query.project);
		projectId = project.id;
		rootId = project.rootId;
		filter.rootIds = [project.rootId];
		filter.projectIds = query.subprojects ? ctx.cache.resolveSubtree(projectId) : [projectId];
	}
	// The query string `status=` parses to an empty list. That list names no
	// status, and the status statement needs one ref at least.
	if (query.status?.length === 0) throw invalidInput("status", "Name one status at least.");
	if (query.status !== undefined) filter.statusIds = await statusIdsOf(ctx, tx, query.status, projectId);
	if (query.category !== undefined) filter.categories = query.category;
	if (query.reviewer !== undefined) filter.reviewer = query.reviewer;
	if (query.priority !== undefined) filter.priority = query.priority;
	// The root project of a tree owns its labels, so a label ref resolves
	// inside the root of the project the query names. A query with no project
	// reads every root, and a name there matches the label of that name in each
	// of them. The value `none` names no label: it keeps the tickets that hold
	// no label at all.
	if (query.label?.length === 0) throw invalidInput("label", "Name one label at least.");
	if (query.label !== undefined) {
		const refs = query.label.filter((ref) => ref !== "none");
		if (refs.length < query.label.length) filter.noLabel = true;
		if (refs.length > 0) filter.labelIds = await labelFilterIds(ctx, tx, refs, rootId);
	}
	if (query.labelNot?.length === 0) throw invalidInput("labelNot", "Name one label at least.");
	if (query.labelNot?.includes("none")) throw invalidInput("labelNot", "Name a label. `none` has no meaning here.");
	if (query.labelNot !== undefined) filter.labelNotIds = await labelFilterIds(ctx, tx, query.labelNot, rootId);
	if (query.parent !== undefined) {
		filter.parent = query.parent === "none" ? "none" : (await resolveTicket(ctx, tx, query.parent)).id;
	}
	if (query.epic !== undefined) {
		filter.epic = query.epic === "none" ? "none" : (await resolveEpic(ctx, tx, query.epic)).id;
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

// Ticket age starts at tickets.created_at and cannot be negative.
export const resolveTicketAge = async (ctx: ServiceCtx, tx: Tx, ref: string) => {
	const row = await resolveTicket(ctx, tx, ref);
	return { id: row.id, ageMs: Math.max(0, ctx.now.getTime() - Date.parse(row.createdAt)) };
};
