import type { QueryClient } from "@tanstack/query-core";
import { EventSchema, type TrellisEvent } from "./events.ts";
import {
	createInvalidationCoalescer,
	family,
	forQuery,
	forTicket,
	INBOX_MAX_WAIT_MS,
	INBOX_TRAILING_MS,
	type Matcher,
	ticketDetail,
	ticketIdentifiers,
} from "./invalidationCoalescer.ts";
import { realScheduler, type Scheduler } from "./scheduler.ts";
import { patchTicketQuery, type TicketChange } from "./ticketPatches.ts";

export { INBOX_MAX_WAIT_MS, INBOX_TRAILING_MS, MAX_WAIT_MS, TRAILING_MS } from "./invalidationCoalescer.ts";
export { realScheduler, type Scheduler } from "./scheduler.ts";

// A patch keeps a row current. A filtered list cannot know whether the row
// still belongs to it after one of these fields changes. Only these fields,
// and a create or a delete, refetch the lists.
export const membershipFields: ReadonlySet<string> = new Set([
	"status",
	"project",
	"priority",
	"parent",
	"completed",
	"completedAt",
	"position",
]);

// A parent's `childDoneCount` and `children` change when a child completes
// or moves. The parent row emits no event of its own, so its detail refetches.
const parentFields: ReadonlySet<string> = new Set(["parent", "status", "completedAt"]);

type TicketEvent = Extract<TrellisEvent, { type: "ticket.created" | "ticket.updated" | "ticket.deleted" }>;

// A ticket change with the event kind the cache reacts to.
type HeldChange = TicketChange & { created: boolean };

const membershipMatchers = [
	family("tickets", "list"),
	family("tickets", "board"),
	family("tickets", "counts"),
	family("inbox", "get"),
];

const isInboxMatcher = (matcher: Matcher) => matcher.path[0] === "inbox";

const toChange = (event: TicketEvent): HeldChange => ({
	summary: event.summary,
	fields: event.fields,
	deleted: event.type === "ticket.deleted",
	created: event.type === "ticket.created",
});

// Two changes to one ticket fold into one. The highest version wins the row.
// Every named field stays named, and a delete or a create stays visible.
const mergeChanges = (held: HeldChange, next: HeldChange): HeldChange => ({
	summary: next.summary.version >= held.summary.version ? next.summary : held.summary,
	fields: [...new Set([...held.fields, ...next.fields])],
	deleted: held.deleted || next.deleted,
	created: held.created || next.created,
});

export type EventApplier = {
	applyEvent: (event: unknown) => void;
	beginMutation: (ticketId: string) => void;
	endMutation: (ticketId: string) => void;
};

// Patch first, invalidate rarely. Every `ticket.*` event patches each cached
// list, board, inbox section, search result, and detail that holds the
// ticket. A patch lands only when the incoming version is higher.
// Invalidations queue in two coalescers, one for the inbox and one for the
// rest, and each flush is one `invalidateQueries` call. A query that waits
// for a refetch takes no patch. The refetch brings the whole row, and a
// patch would clear the invalidated flag with old data still in the query.
// A query whose refetch is already running refetches once more after the
// event: that refetch may have read the rows before the event's commit, and
// under `staleTime: Infinity` nothing else would repair the older row. While
// a mutation is in flight for a ticket, its events wait, folded into one
// change. They apply after the mutation settles, so the mutation's own
// response never overwrites a newer row.
export const createEventApplier = (queryClient: QueryClient, options: { scheduler?: Scheduler } = {}): EventApplier => {
	const scheduler = options.scheduler ?? realScheduler;
	const general = createInvalidationCoalescer(queryClient, scheduler);
	const inbox = createInvalidationCoalescer(queryClient, scheduler, {
		trailingMs: INBOX_TRAILING_MS,
		maxWaitMs: INBOX_MAX_WAIT_MS,
	});
	const inFlight = new Map<string, number>();
	const waiting = new Map<string, HeldChange>();

	const enqueue = (matchers: Matcher[]) => {
		const inboxMatchers = matchers.filter(isInboxMatcher);
		const generalMatchers = matchers.filter((matcher) => !isInboxMatcher(matcher));
		if (inboxMatchers.length > 0) inbox.enqueue(inboxMatchers);
		if (generalMatchers.length > 0) general.enqueue(generalMatchers);
	};

	const invalidateAll = () => {
		inbox.invalidateAll();
		general.invalidateAll();
	};

	// Returns the id of every cached parent whose `children` lost a row. The
	// identifier map and the pending sets are built once per change, so one
	// change costs a fixed number of cache scans however many queries the
	// cache holds.
	const patchTicket = (change: TicketChange) => {
		const parentsThatLostAChild: string[] = [];
		const identifiers = ticketIdentifiers(queryClient);
		const pending = new Set([...general.pendingQueries(identifiers), ...inbox.pendingQueries(identifiers)]);
		for (const query of queryClient.getQueryCache().getAll()) {
			const data = query.state.data;
			if (data === undefined) continue;
			const detail = isDetail(query.queryKey);
			if (change.deleted && detail && (data as { id: unknown }).id === change.summary.id) {
				queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
				continue;
			}
			const patched = patchTicketQuery(query.queryKey, data, change);
			if (patched === undefined) continue;
			if (query.state.isInvalidated) {
				enqueue([forQuery(query)]);
				continue;
			}
			if (pending.has(query)) continue;
			queryClient.setQueryData(query.queryKey, patched);
			if (detail && childCount(patched) < childCount(data)) parentsThatLostAChild.push((data as { id: string }).id);
		}
		return parentsThatLostAChild;
	};

	// The server writes an activity row for every ticket change, and the
	// timeline lists activity beside the comments. So the ticket's timeline
	// refetches on every change but a delete, which drops the ticket page.
	const applyChange = (change: HeldChange) => {
		const { summary, fields } = change;
		const parentsThatLostAChild = patchTicket(change);
		const membership = change.created || change.deleted;
		if (membership || fields.some((field) => membershipFields.has(field))) enqueue(membershipMatchers);
		if ((membership || fields.some((field) => parentFields.has(field))) && summary.parent !== null) {
			enqueue(ticketDetail(summary.parent.id));
		}
		for (const id of parentsThatLostAChild) enqueue(ticketDetail(id));
		if (fields.includes("description")) enqueue(ticketDetail(summary.id));
		if (!change.deleted) enqueue([forTicket(["timeline", "list"], summary.id)]);
	};

	const applyTicketEvent = (event: TicketEvent) => {
		const id = event.summary.id;
		const change = toChange(event);
		if (inFlight.has(id)) {
			const held = waiting.get(id);
			waiting.set(id, held === undefined ? change : mergeChanges(held, change));
			return;
		}
		applyChange(change);
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
				enqueue([forTicket(["timeline", "list"], event.ticketId), ...ticketDetail(event.ticketId)]);
				return;
			case "attachment.created":
			case "attachment.deleted":
				enqueue([forTicket(["attachments", "list"], event.ticketId), ...ticketDetail(event.ticketId)]);
				return;
			case "pr.linked":
			case "pr.unlinked":
			case "pr.updated":
				enqueue([
					...event.ticketIds.flatMap((ticketId) => [
						forTicket(["pullRequests", "list"], ticketId),
						...ticketDetail(ticketId),
					]),
					family("tickets", "list"),
					family("tickets", "board"),
					family("inbox", "get"),
				]);
				return;
			// A status rename or a reviewer change alters the `status` inside
			// every cached summary and the Needs you sections without a ticket
			// row change, and a project rename alters `project.path` the same
			// way. So every query that holds a summary refetches.
			case "statuses.changed":
			case "project.created":
			case "project.updated":
			case "project.deleted":
			case "project.moved":
				enqueue([family("statuses"), family("projects"), family("tickets"), family("inbox", "get"), family("search")]);
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
		if (held !== undefined) applyChange(held);
	};

	return { applyEvent, beginMutation, endMutation };
};

// True for a `tickets.get` key: `[["tickets", "get"], options]`.
const isDetail = (queryKey: readonly unknown[]) => {
	const path = queryKey[0];
	return Array.isArray(path) && path.join(".") === "tickets.get";
};

const childCount = (detail: unknown) => (detail as { children: unknown[] }).children.length;

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
