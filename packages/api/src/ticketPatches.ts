import type { QueryKey } from "@tanstack/query-core";
import type { InboxSection } from "./schemas/inbox.ts";
import type { SearchOutput } from "./schemas/search.ts";
import type { BoardOutput, ListOutput, Ticket, TicketSummary } from "./schemas/ticket.ts";

// One ticket event as the cache sees it. `fields` names the ticket columns
// the change touched; `deleted` is true for `ticket.deleted`.
export type TicketChange = { summary: TicketSummary; fields: readonly string[]; deleted: boolean };

// An infinite query stores one list output per page.
type InfiniteListOutput = { pages: ListOutput[]; pageParams: unknown[] };

// Returns the patched array, or undefined when the array does not hold the
// ticket or already holds a version at least as new.
const patchItems = (items: TicketSummary[], { summary, deleted }: TicketChange) => {
	const index = items.findIndex((item) => item.id === summary.id);
	if (index < 0) return undefined;
	if (deleted) return items.toSpliced(index, 1);
	if (summary.version <= items[index]!.version) return undefined;
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

// A child row inside a parent's `children`. A deleted child and a child that
// now names another parent leave the array; a newer version replaces the row.
const patchChildren = (data: Ticket, change: TicketChange) => {
	const left = change.deleted || change.summary.parent?.id !== data.id;
	const children = patchItems(data.children, { ...change, deleted: left });
	return children === undefined ? undefined : { ...data, children };
};

// The detail keeps the fields the summary does not carry: description,
// children, prs, attachments. A description change is not in the summary, so
// the detail stays at its version and the applier refetches it; a detail that
// took the new version with the old text would let the next save overwrite
// the newer text.
const patchDetail = (data: Ticket, change: TicketChange) => {
	if (data.id !== change.summary.id) return patchChildren(data, change);
	if (change.summary.version <= data.version) return undefined;
	if (change.fields.includes("description")) return undefined;
	return { ...data, ...change.summary };
};

// The cached shapes that hold ticket summaries, by procedure path.
const patchers: Record<string, (data: unknown, change: TicketChange) => unknown> = {
	"tickets.list": (data, change) => patchList(data as ListOutput, change),
	"tickets.board": (data, change) => patchBoard(data as BoardOutput, change),
	"inbox.get": (data, change) => patchInbox(data as Record<string, InboxSection>, change),
	"search.query": (data, change) => patchSearch(data as SearchOutput, change),
	"tickets.get": (data, change) => patchDetail(data as Ticket, change),
};

// Returns the patched data for one cache entry, or undefined when the entry
// does not change. An oRPC key is `[path, {input?, type?}]`; the QueryClient
// also holds keys other code created, and those never hold a ticket.
export const patchTicketQuery = (queryKey: QueryKey, data: unknown, change: TicketChange) => {
	const [path, options] = queryKey as [unknown, { type?: string } | undefined];
	if (!Array.isArray(path)) return undefined;
	const name = path.join(".");
	if (name === "tickets.list" && options?.type === "infinite") {
		return patchInfiniteList(data as InfiniteListOutput, change);
	}
	const patcher = patchers[name];
	return patcher === undefined ? undefined : patcher(data, change);
};
