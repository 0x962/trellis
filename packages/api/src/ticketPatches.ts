import type { QueryKey } from "@tanstack/query-core";
import type { InboxSection } from "./schemas/inbox.ts";
import type { SearchOutput } from "./schemas/search.ts";
import type { BoardOutput, ListOutput, Ticket, TicketSummary } from "./schemas/ticket.ts";

// One ticket change as the cache sees it. `fields` names the ticket columns
// the change touched; `deleted` is true for `ticket.deleted`. `detail` is
// the whole ticket when the change is a mutation's response. It carries the
// text, so it replaces the ticket's own detail entry.
export type TicketChange = {
	summary: TicketSummary;
	fields: readonly string[];
	deleted: boolean;
	detail?: Ticket;
};

// An infinite query stores one list output per page.
type InfiniteListOutput = { pages: ListOutput[]; pageParams: unknown[] };

// Returns the patched array, or undefined when the array does not hold the
// ticket or already holds a version at least as new. A delete is final, so
// it removes the row at any version. `left` says the row no longer belongs
// in this array; a newer cached row outranks a stale `left`.
const patchItems = (items: TicketSummary[], { summary, deleted }: TicketChange, left = false) => {
	const index = items.findIndex((item) => item.id === summary.id);
	if (index < 0) return undefined;
	if (deleted) return items.toSpliced(index, 1);
	if (summary.version <= items[index]!.version) return undefined;
	if (left) return items.toSpliced(index, 1);
	return items.with(index, summary);
};

const patchList = (data: ListOutput, change: TicketChange) => {
	const items = patchItems(data.items, change);
	return items === undefined ? undefined : { ...data, items };
};

const patchInfiniteList = (data: InfiniteListOutput, change: TicketChange) => {
	let changed = false;
	const pages = data.pages.map((page) => {
		const patched = patchList(page, change);
		if (patched === undefined) return page;
		changed = true;
		return patched;
	});
	return changed ? { ...data, pages } : undefined;
};

const patchBoard = (data: BoardOutput, change: TicketChange) => {
	let changed = false;
	const columns = data.columns.map((column) => {
		const items = patchItems(column.items, change);
		if (items === undefined) return column;
		changed = true;
		return { ...column, items, count: column.count - (column.items.length - items.length) };
	});
	return changed ? { ...data, columns } : undefined;
};

// Every inbox section is `{items, total}`, so the sections are walked by name.
const patchInbox = (data: Record<string, InboxSection>, change: TicketChange) => {
	let changed = false;
	const sections: Record<string, InboxSection> = {};
	for (const [name, section] of Object.entries(data)) {
		const items = patchItems(section.items, change);
		if (items === undefined) {
			sections[name] = section;
			continue;
		}
		changed = true;
		sections[name] = { ...section, items, total: section.total - (section.items.length - items.length) };
	}
	return changed ? sections : undefined;
};

const patchSearch = (data: SearchOutput, change: TicketChange) => {
	const tickets = patchItems(data.tickets, change);
	return tickets === undefined ? undefined : { ...data, tickets };
};

// A child row inside a parent's `children`. A child that now names another
// parent leaves the array, and a newer version replaces the row.
const patchChildren = (data: Ticket, change: TicketChange) => {
	const children = patchItems(data.children, change, change.summary.parent?.id !== data.id);
	return children === undefined ? undefined : { ...data, children };
};

// The detail keeps the fields the summary does not carry: description,
// children, prs, attachments. A description change is not in the summary.
// So the detail keeps its old text at the new version, and it carries
// `descriptionStale` until a refetch replaces the whole entry.
const patchDetail = (data: Ticket, change: TicketChange): Ticket | undefined => {
	if (data.id !== change.summary.id) return patchChildren(data, change);
	if (change.summary.version <= data.version) return undefined;
	if (change.detail !== undefined) return change.detail;
	const patched = { ...data, ...change.summary };
	return change.fields.includes("description") ? { ...patched, descriptionStale: true } : patched;
};

// The cached shapes that hold ticket summaries, by procedure path.
const patchers: Record<string, (data: unknown, change: TicketChange) => unknown> = {
	"tickets.list": (data, change) => patchList(data as ListOutput, change),
	"tickets.board": (data, change) => patchBoard(data as BoardOutput, change),
	"inbox.get": (data, change) => patchInbox(data as Record<string, InboxSection>, change),
	"search.query": (data, change) => patchSearch(data as SearchOutput, change),
	"tickets.get": (data, change) => patchDetail(data as Ticket, change),
};

// The procedure path of an oRPC key `[path, {input?, type?}]`, or undefined
// for a key other code created. Such a key never holds a ticket.
const pathName = (queryKey: QueryKey) => {
	const path = queryKey[0];
	return Array.isArray(path) ? path.join(".") : undefined;
};

const isInfinite = (queryKey: QueryKey) => (queryKey[1] as { type?: string } | undefined)?.type === "infinite";

// True for a `tickets.get` key: `[["tickets", "get"], options]`.
export const isDetail = (queryKey: QueryKey) => pathName(queryKey) === "tickets.get";

const rowReaders: Record<string, (data: unknown) => TicketSummary[]> = {
	"tickets.list": (data) => (data as ListOutput).items,
	"tickets.board": (data) => (data as BoardOutput).columns.flatMap((column) => column.items),
	"inbox.get": (data) => Object.values(data as Record<string, InboxSection>).flatMap((section) => section.items),
	"search.query": (data) => (data as SearchOutput).tickets,
	"tickets.get": (data) => [data as Ticket, ...(data as Ticket).children],
};

// True for a key whose data is one of the shapes that hold ticket rows.
export const holdsTicketRows = (queryKey: QueryKey) => {
	const name = pathName(queryKey);
	return name !== undefined && name in rowReaders;
};

// The ticket rows one cache entry holds: a detail's own row and its
// children, or the items of every page, column, or section.
export const ticketRows = (queryKey: QueryKey, data: unknown): TicketSummary[] => {
	const name = pathName(queryKey);
	if (name === undefined) return [];
	if (name === "tickets.list" && isInfinite(queryKey))
		return (data as InfiniteListOutput).pages.flatMap((page) => page.items);
	const reader = rowReaders[name];
	return reader === undefined ? [] : reader(data);
};

// Returns the patched data for one cache entry, or undefined when the entry
// does not change.
export const patchTicketQuery = (queryKey: QueryKey, data: unknown, change: TicketChange) => {
	const name = pathName(queryKey);
	if (name === undefined) return undefined;
	if (name === "tickets.list" && isInfinite(queryKey)) return patchInfiniteList(data as InfiniteListOutput, change);
	const patcher = patchers[name];
	return patcher === undefined ? undefined : patcher(data, change);
};
