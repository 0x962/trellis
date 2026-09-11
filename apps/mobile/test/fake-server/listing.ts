import {
	type ListQuery,
	PrioritySchema,
	StatusCategorySchema,
	StatusRefSchema,
	type TicketSummary,
} from "@trellis/api";
import { fail } from "./fail";
import { findTicket } from "./refs";
import { type ProjectRow, type State, subtree, type TicketRow } from "./state";
import { prBadge } from "./summaries";

// The shared list grammar over the in-memory rows: every filter narrows,
// the sort orders, and an opaque cursor pages.

const priorityOrder = PrioritySchema.options;
const categoryOrder = StatusCategorySchema.options;

const statusMatches = (state: State, row: TicketRow, ref: string) => {
	const status = state.statuses.get(row.statusId)!;
	const parsed = StatusRefSchema.parse(ref);
	if (parsed.kind === "ulid") return status.id === parsed.id;
	if (parsed.kind === "category") return status.category === parsed.category;
	const value = parsed.value.toLowerCase();
	return status.slug === value || status.name.toLowerCase() === value;
};

const tokens = (text: string) =>
	text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token !== "");

// A query matches when a token of the title or the description starts
// with every token of the query.
export const textMatches = (row: { title: string; description: string }, q: string) => {
	const words = tokens(`${row.title} ${row.description}`);
	return tokens(q).every((needle) => words.some((word) => word.startsWith(needle)));
};

// The number of insertions, deletions, substitutions, and swaps of two
// neighbours that turn `a` into `b`. It stops counting at 2, because every
// caller asks for at most one edit.
const editDistance = (a: string, b: string) => {
	const rows: number[][] = [];
	for (let i = 0; i <= a.length; i += 1) rows.push(new Array<number>(b.length + 1).fill(0));
	for (let i = 0; i <= a.length; i += 1) rows[i]![0] = i;
	for (let j = 0; j <= b.length; j += 1) rows[0]![j] = j;
	for (let i = 1; i <= a.length; i += 1) {
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				best = Math.min(best, rows[i - 2]![j - 2]! + 1);
			}
			rows[i]![j] = best;
		}
	}
	return rows[a.length]![b.length]!;
};

// A typed word finds a title word that one edit away: "teh" finds "the"
// and "restor" finds "restore". A word of one or two letters matches by
// prefix only, because one edit reaches too far from there.
export const titleMatches = (title: string, q: string) => {
	const words = tokens(title);
	return tokens(q).every((needle) =>
		words.some((word) => word.startsWith(needle) || (needle.length >= 3 && editDistance(needle, word) <= 1)),
	);
};

const prMatches = (state: State, row: TicketRow, filter: NonNullable<ListQuery["pr"]>) => {
	const prs = state.prLinks.filter((link) => link.ticketId === row.id).map((link) => state.prs.get(link.prId)!);
	if (filter === "any") return prs.length > 0;
	if (filter === "none") return prs.length === 0;
	if (filter === "draft") return prs.some((pr) => pr.state === "open" && pr.isDraft);
	return prs.some((pr) => pr.state === filter);
};

export const filterTickets = (state: State, query: Partial<ListQuery>, project: ProjectRow | null): TicketRow[] => {
	const scope =
		project === null
			? null
			: new Set((query.subprojects === false ? [project] : subtree(state, project.id)).map((row) => row.id));
	const parent = query.parent === undefined || query.parent === "none" ? null : findTicket(state, query.parent);
	if (query.parent !== undefined && query.parent !== "none" && parent === undefined) {
		throw fail("NOT_FOUND", { kind: "ticket", ref: query.parent });
	}
	return [...state.tickets.values()].filter((row) => {
		const status = state.statuses.get(row.statusId)!;
		if (scope !== null && !scope.has(row.projectId)) return false;
		if (query.status !== undefined && !query.status.some((ref) => statusMatches(state, row, ref))) return false;
		if (query.category !== undefined && !query.category.includes(status.category)) return false;
		if (query.reviewer !== undefined && status.reviewer !== query.reviewer) return false;
		if (query.priority !== undefined && !query.priority.includes(row.priority)) return false;
		if (query.parent === "none" && row.parentId !== null) return false;
		if (parent !== null && parent !== undefined && row.parentId !== parent.id) return false;
		if (query.pr !== undefined && !prMatches(state, row, query.pr)) return false;
		if (query.ci !== undefined && !query.ci.includes(prBadge(state, row.id)?.ciState ?? "none")) return false;
		if (query.actor !== undefined && !actorMatches(row, query.actor)) return false;
		if (query.q !== undefined && !textMatches(row, query.q)) return false;
		if (query.updated !== undefined && row.updatedAt < query.updated) return false;
		if (query.created !== undefined && row.createdAt < query.created) return false;
		if (query.completed !== undefined && (row.completedAt === null || row.completedAt < query.completed)) return false;
		return true;
	});
};

// `kind:name` matches both fields; a bare name matches the name.
const actorMatches = (row: TicketRow, filter: string) => {
	if (row.lastActor === null) return false;
	const colon = filter.indexOf(":");
	if (colon === -1) return row.lastActor.name === filter;
	return row.lastActor.kind === filter.slice(0, colon) && row.lastActor.name === filter.slice(colon + 1);
};

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const statusRank = (state: State, row: TicketRow) => {
	const status = state.statuses.get(row.statusId)!;
	return categoryOrder.indexOf(status.category) * 1000 + status.position;
};

// The sort field, then id desc as the tiebreak.
export const sortTickets = (state: State, rows: TicketRow[], sort: ListQuery["sort"]): TicketRow[] => {
	const desc = sort.startsWith("-");
	const field = desc ? sort.slice(1) : sort;
	const keyOf = (row: TicketRow): number | string => {
		if (field === "updatedAt") return row.updatedAt;
		if (field === "createdAt") return row.createdAt;
		if (field === "priority") return priorityOrder.indexOf(row.priority);
		if (field === "number") return row.number;
		if (field === "status") return statusRank(state, row);
		return row.position;
	};
	return [...rows].sort((a, b) => {
		const left = keyOf(a);
		const right = keyOf(b);
		const order = typeof left === "number" ? left - (right as number) : compareText(left, right as string);
		if (order !== 0) return desc ? -order : order;
		return -compareText(a.id, b.id);
	});
};

// A cursor is bound to a hash of the filter and the sort. A cursor sent
// with another filter or sort fails INVALID_CURSOR.
const hashOf = (query: ListQuery) => {
	const { cursor, limit, ...rest } = query;
	return JSON.stringify(rest, Object.keys(rest).sort());
};

export const decodeCursor = (query: ListQuery): number => {
	if (query.cursor === undefined) return 0;
	const parsed = JSON.parse(Buffer.from(query.cursor, "base64url").toString()) as { h: string; o: number };
	if (parsed.h !== hashOf(query)) throw fail("INVALID_CURSOR", undefined);
	return parsed.o;
};

export const encodeCursor = (query: ListQuery, offset: number) =>
	Buffer.from(JSON.stringify({ h: hashOf(query), o: offset })).toString("base64url");

export type Page = { items: TicketSummary[]; nextCursor: string | null };
