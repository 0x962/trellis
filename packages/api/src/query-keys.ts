import { partialMatchKey, type Query, type QueryClient, type QueryKey } from "@tanstack/query-core";
import { EventSchema, type TrellisEvent } from "./events.ts";
import type { InboxSection } from "./schemas/inbox.ts";
import type { SearchOutput } from "./schemas/search.ts";
import type { BoardOutput, ListOutput, Ticket, TicketSummary } from "./schemas/ticket.ts";

// The clock and the timers the coalescer uses. A test injects a fake one, so
// no test waits on real time.
export type Scheduler = {
	now: () => number;
	setTimeout: (callback: () => void, delayMs: number) => unknown;
	clearTimeout: (handle: unknown) => void;
};

export const realScheduler: Scheduler = {
	now: () => Date.now(),
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// A flush runs 250 ms after the last queued invalidation and at most 1 s
// after the first one, so a constant event stream still refetches once a second.
export const TRAILING_MS = 250;
export const MAX_WAIT_MS = 1000;

// A patch keeps a row current, but a filtered list cannot know whether the
// row still belongs to it after one of these fields changes. Only these
// fields, and a create or a delete, refetch the lists.
export const membershipFields: ReadonlySet<string> = new Set([
	"status",
	"project",
	"priority",
	"parent",
	"completed",
	"completedAt",
	"position",
]);

type TicketEvent = Extract<TrellisEvent, { type: "ticket.created" | "ticket.updated" | "ticket.deleted" }>;

// One query family to invalidate. `path` is a prefix of the procedure path
// (`["tickets"]` covers every ticket query). `input` narrows by the query
// input; `dataId` narrows by the `id` inside the cached data, which is how
// a detail keyed by identifier is found by ULID.
type Matcher = { path: string[]; input?: Record<string, unknown>; dataId?: string };

const family = (...path: string[]): Matcher => ({ path });
const byInput = (path: string[], input: Record<string, unknown>): Matcher => ({ path, input });

const membershipMatchers = [
	family("tickets", "list"),
	family("tickets", "board"),
	family("tickets", "counts"),
	family("inbox", "get"),
];

const ticketDetail = (id: string) => [
	{ path: ["tickets", "get"], dataId: id },
	byInput(["tickets", "get"], { ticket: id }),
];

const dataId = (query: Query) => (query.state.data as { id?: unknown } | undefined)?.id;

const matches = (query: Query, matcher: Matcher) => {
	const key: QueryKey = matcher.input === undefined ? [matcher.path] : [matcher.path, { input: matcher.input }];
	return partialMatchKey(query.queryKey, key) && (matcher.dataId === undefined || dataId(query) === matcher.dataId);
};

const pathOf = (query: Query) => (query.queryKey[0] as string[]).join(".");

// Returns the patched array, or undefined when the array does not hold the
// ticket or already holds a version at least as new.
const patchItems = (items: TicketSummary[], summary: TicketSummary, deleted: boolean) => {
	const index = items.findIndex((item) => item.id === summary.id);
	if (index < 0) return undefined;
	if (deleted) return items.toSpliced(index, 1);
	if (summary.version <= items[index]!.version) return undefined;
	return items.with(index, summary);
};

const patchList = (data: ListOutput, summary: TicketSummary, deleted: boolean) => {
	const items = patchItems(data.items, summary, deleted);
	return items === undefined ? undefined : { ...data, items };
};

const patchBoard = (data: BoardOutput, summary: TicketSummary, deleted: boolean) => {
	let changed = false;
	const columns = data.columns.map((column) => {
		const items = patchItems(column.items, summary, deleted);
		if (items === undefined) return column;
		changed = true;
		return { ...column, items, count: column.count - (column.items.length - items.length) };
	});
	return changed ? { ...data, columns } : undefined;
};

// Every inbox section is `{items, total}`, so the sections are walked by name.
const patchInbox = (data: Record<string, InboxSection>, summary: TicketSummary, deleted: boolean) => {
	let changed = false;
	const sections: Record<string, InboxSection> = {};
	for (const [name, section] of Object.entries(data)) {
		const items = patchItems(section.items, summary, deleted);
		if (items === undefined) {
			sections[name] = section;
			continue;
		}
		changed = true;
		sections[name] = { ...section, items, total: section.total - (section.items.length - items.length) };
	}
	return changed ? sections : undefined;
};

const patchSearch = (data: SearchOutput, summary: TicketSummary, deleted: boolean) => {
	const tickets = patchItems(data.tickets, summary, deleted);
	return tickets === undefined ? undefined : { ...data, tickets };
};

// The detail keeps the fields the summary does not carry: description,
// children, prs, attachments. A child's own event patches it inside `children`.
const patchDetail = (data: Ticket, summary: TicketSummary) => {
	if (data.id !== summary.id) {
		const children = patchItems(data.children, summary, false);
		return children === undefined ? undefined : { ...data, children };
	}
	if (summary.version <= data.version) return undefined;
	return { ...data, ...summary };
};

// The cached shapes that hold ticket summaries, by procedure path.
const patchers: Record<string, (data: unknown, summary: TicketSummary, deleted: boolean) => unknown> = {
	"tickets.list": (data, summary, deleted) => patchList(data as ListOutput, summary, deleted),
	"tickets.board": (data, summary, deleted) => patchBoard(data as BoardOutput, summary, deleted),
	"inbox.get": (data, summary, deleted) => patchInbox(data as Record<string, InboxSection>, summary, deleted),
	"search.query": (data, summary, deleted) => patchSearch(data as SearchOutput, summary, deleted),
	"tickets.get": (data, summary) => patchDetail(data as Ticket, summary),
};

export type EventApplier = {
	applyEvent: (event: unknown) => void;
	beginMutation: (ticketId: string) => void;
	endMutation: (ticketId: string) => void;
};

// Patch first, invalidate rarely. Every `ticket.*` event patches each cached
// list, board, inbox section, search result, and detail that holds the
// ticket, and only when the incoming version is higher. Invalidations queue
// in a coalescer and flush as one `invalidateQueries` call. While a mutation
// is in flight for a ticket, its events wait and the highest version applies
// after the mutation settles, so the mutation's own response never overwrites
// a newer row.
export const createEventApplier = (queryClient: QueryClient, options: { scheduler?: Scheduler } = {}): EventApplier => {
	const scheduler = options.scheduler ?? realScheduler;
	const inFlight = new Map<string, number>();
	const waiting = new Map<string, TicketEvent>();
	const pending = new Map<string, Matcher>();
	let timer: unknown;
	let firstQueuedAt = 0;

	const flush = () => {
		timer = undefined;
		const matchers = [...pending.values()];
		pending.clear();
		void queryClient.invalidateQueries({ predicate: (query) => matchers.some((matcher) => matches(query, matcher)) });
	};

	const enqueue = (matchers: Matcher[]) => {
		for (const matcher of matchers) pending.set(JSON.stringify(matcher), matcher);
		const now = scheduler.now();
		if (timer === undefined) {
			firstQueuedAt = now;
		} else {
			scheduler.clearTimeout(timer);
		}
		const flushAt = Math.min(now + TRAILING_MS, firstQueuedAt + MAX_WAIT_MS);
		timer = scheduler.setTimeout(flush, flushAt - now);
	};

	const invalidateAll = () => {
		if (timer !== undefined) scheduler.clearTimeout(timer);
		timer = undefined;
		pending.clear();
		void queryClient.invalidateQueries();
	};

	const patchTicket = (summary: TicketSummary, deleted: boolean) => {
		for (const query of queryClient.getQueryCache().getAll()) {
			const data = query.state.data;
			if (data === undefined) continue;
			const path = pathOf(query);
			if (path === "tickets.get" && deleted && (data as Ticket).id === summary.id) {
				queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
				continue;
			}
			const patcher = patchers[path];
			if (patcher === undefined) continue;
			const patched = patcher(data, summary, deleted);
			if (patched !== undefined) queryClient.setQueryData(query.queryKey, patched);
		}
	};

	const applyTicketEvent = (event: TicketEvent) => {
		const id = event.summary.id;
		if (inFlight.has(id)) {
			const held = waiting.get(id);
			if (held === undefined || held.summary.version < event.summary.version) waiting.set(id, event);
			return;
		}
		patchTicket(event.summary, event.type === "ticket.deleted");
		if (event.type !== "ticket.updated" || event.fields.some((field) => membershipFields.has(field))) {
			enqueue(membershipMatchers);
		}
	};

	const applyEvent = (input: unknown) => {
		const event = EventSchema.parse(input);
		switch (event.type) {
			case "ticket.created":
			case "ticket.updated":
			case "ticket.deleted":
				applyTicketEvent(event);
				return;
			case "comment.created":
			case "comment.updated":
			case "comment.deleted":
				enqueue([byInput(["timeline", "list"], { ticket: event.ticketId }), ...ticketDetail(event.ticketId)]);
				return;
			case "attachment.created":
			case "attachment.deleted":
				enqueue([byInput(["attachments", "list"], { ticket: event.ticketId }), ...ticketDetail(event.ticketId)]);
				return;
			case "pr.linked":
			case "pr.unlinked":
			case "pr.updated":
				enqueue([
					...event.ticketIds.flatMap((ticketId) => [
						byInput(["pullRequests", "list"], { ticket: ticketId }),
						...ticketDetail(ticketId),
					]),
					family("tickets", "list"),
					family("tickets", "board"),
					family("inbox", "get"),
				]);
				return;
			case "statuses.changed":
			case "project.created":
			case "project.updated":
			case "project.deleted":
			case "project.moved":
				enqueue([
					family("statuses"),
					family("projects"),
					family("tickets", "list"),
					family("tickets", "board"),
					family("tickets", "counts"),
				]);
				return;
			case "gh.status":
				enqueue([family("system", "gh")]);
				return;
			case "reset":
				invalidateAll();
				return;
			case "ready":
			case "bye":
				return;
		}
	};

	const beginMutation = (ticketId: string) => {
		inFlight.set(ticketId, (inFlight.get(ticketId) ?? 0) + 1);
	};

	const endMutation = (ticketId: string) => {
		const remaining = inFlight.get(ticketId)! - 1;
		if (remaining > 0) {
			inFlight.set(ticketId, remaining);
			return;
		}
		inFlight.delete(ticketId);
		const held = waiting.get(ticketId);
		waiting.delete(ticketId);
		if (held !== undefined) applyTicketEvent(held);
	};

	return { applyEvent, beginMutation, endMutation };
};

// One applier per QueryClient, created on first use with real timers.
const appliers = new WeakMap<QueryClient, EventApplier>();

export const eventApplierFor = (queryClient: QueryClient) => {
	const existing = appliers.get(queryClient);
	if (existing !== undefined) return existing;
	const applier = createEventApplier(queryClient);
	appliers.set(queryClient, applier);
	return applier;
};

export const applyEvent = (event: unknown, queryClient: QueryClient) => {
	eventApplierFor(queryClient).applyEvent(event);
};
