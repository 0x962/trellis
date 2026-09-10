import type { QueryClient } from "@tanstack/query-core";
import { dropTicketQueries } from "./dropTicketQueries.ts";
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
} from "./invalidationCoalescer.ts";
import { realScheduler, type Scheduler } from "./scheduler.ts";
import type { Ticket } from "./schemas/ticket.ts";
import { createSettleCheck } from "./settleCheck.ts";
import {
	holdsTicketRow,
	holdsTicketRows,
	isCounts,
	isDetail,
	patchTicketQuery,
	type TicketChange,
} from "./ticketPatches.ts";
import { createTombstones } from "./tombstones.ts";

export { INBOX_MAX_WAIT_MS, INBOX_TRAILING_MS, MAX_WAIT_MS, TRAILING_MS } from "./invalidationCoalescer.ts";
export { realScheduler, type Scheduler } from "./scheduler.ts";
export { TOMBSTONE_MS } from "./tombstones.ts";

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

// The projects list carries `openCount` and `needsYouCount`, and no
// project event follows a ticket change. So it refetches with the lists.
const membershipMatchers = [
	family("tickets", "list"),
	family("tickets", "board"),
	family("tickets", "counts"),
	family("inbox", "get"),
	family("projects", "list"),
];

const isInboxMatcher = (matcher: Matcher) => matcher.path[0] === "inbox";

// True when the change can move a ticket into or out of a filtered list.
const changesMembership = (change: HeldChange) =>
	change.created || change.deleted || change.fields.some((field) => membershipFields.has(field));

const toChange = (event: TicketEvent): HeldChange => ({
	summary: event.summary,
	fields: event.fields,
	deleted: event.type === "ticket.deleted",
	created: event.type === "ticket.created",
});

// A mutation's response names no fields. The event for the same write
// carries them, and it arrives held or after the response.
const toResultChange = (result: Ticket): HeldChange => {
	const { description, children, prs, attachments, descriptionStale, ...summary } = result;
	return { summary, fields: [], deleted: false, created: false, detail: result };
};

export type EventApplier = {
	applyEvent: (event: unknown) => void;
	beginMutation: (ticketId: string) => void;
	endMutation: (ticketId: string, result?: Ticket) => void;
};

// Patch first, invalidate rarely. A `ticket.*` event visits every cached
// list, board, inbox section, search result, and detail that holds the
// ticket. An entry takes the event's summary only when the event's version
// is higher than the entry's own, and then its version equals the event's.
// The compare is per entry, so an older event never overwrites a newer
// field and never lowers a version. A queued invalidation never blocks a
// patch, and neither does a fetch in flight: the patch lands, and the
// fetch's result replaces it. The settle check keeps every change made
// during a fetch. It compares each row of the result with those changes
// and refetches a query whose rows are behind. The detail
// holds the description, which a summary lacks. A description event moves
// the detail to its version, sets `descriptionStale`, and queues the
// detail's refetch. The refetch replaces the whole entry, which clears the
// flag. Invalidations queue in two coalescers, one for the inbox and one
// for the rest, and each flush is one `invalidateQueries` call. While a
// mutation is in flight for a ticket, its create and update events wait.
// On settle the mutation's response goes in first, then the held events
// in version order, so the response never overwrites a newer row. A
// delete is final and never waits. Every query that names the ticket is
// cancelled and removed, so a fetch in flight never lands. The id is
// tombstoned for `TOMBSTONE_MS`. A create, an update, or a mutation
// response for a tombstoned id applies nothing.
export const createEventApplier = (queryClient: QueryClient, options: { scheduler?: Scheduler } = {}): EventApplier => {
	const scheduler = options.scheduler ?? realScheduler;
	const general = createInvalidationCoalescer(queryClient, scheduler);
	const inbox = createInvalidationCoalescer(queryClient, scheduler, {
		trailingMs: INBOX_TRAILING_MS,
		maxWaitMs: INBOX_MAX_WAIT_MS,
	});
	const inFlight = new Map<string, number>();
	const waiting = new Map<string, HeldChange[]>();
	const tombstones = createTombstones(scheduler);
	const settle = createSettleCheck(queryClient);

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

	// Returns the id of every cached parent whose `children` lost a row. One
	// change walks the cache once, however many queries the cache holds. A
	// query with a fetch in flight, or with no data yet, gets the change
	// recorded for the settle check. The record says whether the query had
	// no data or held the row. A change at the cached version patches
	// nothing, so the row's presence decides, not the patch. The check
	// reads every row of the result. A
	// row below its recorded version, or an expected row the result lacks,
	// makes the query refetch. A counts result holds no row, so a
	// membership change is recorded and makes counts refetch at settle. A
	// query that was invalidated before the patch refetches once more after
	// it, because `setQueryData` clears the invalidated flag. A detail that
	// took a description event refetches, so the text catches up.
	const patchTicket = (change: HeldChange) => {
		const parentsThatLostAChild: string[] = [];
		const { id } = change.summary;
		const description = change.fields.includes("description");
		const membership = changesMembership(change);
		for (const query of queryClient.getQueryCache().getAll()) {
			const data = query.state.data;
			const fetching = query.state.fetchStatus !== "idle";
			const settles = fetching && (holdsTicketRows(query.queryKey) || (isCounts(query.queryKey) && membership));
			if (data === undefined) {
				if (settles) settle.record(query, change, true);
				continue;
			}
			const detail = isDetail(query.queryKey);
			const own = detail && (data as { id: unknown }).id === id;
			const patched = patchTicketQuery(query.queryKey, data, change);
			if (settles) settle.record(query, change, holdsTicketRow(query.queryKey, data, id));
			if (patched === undefined) continue;
			const invalidated = query.state.isInvalidated;
			queryClient.setQueryData(query.queryKey, patched);
			if (!fetching && (invalidated || (own && description))) enqueue([forQuery(query)]);
			if (detail && childCount(patched) < childCount(data)) parentsThatLostAChild.push((data as { id: string }).id);
		}
		return parentsThatLostAChild;
	};

	// The server writes an activity row for every ticket change, and the
	// timeline lists activity beside the comments. So the ticket's timeline
	// refetches on every change but a delete, which drops the ticket page.
	const applyChange = (change: HeldChange) => {
		const { summary, fields } = change;
		if (change.deleted) {
			tombstones.add(summary.id);
			dropTicketQueries(queryClient, summary);
		} else if (tombstones.has(summary.id)) {
			return;
		}
		const parentsThatLostAChild = patchTicket(change);
		const membership = change.created || change.deleted;
		if (changesMembership(change)) enqueue(membershipMatchers);
		if ((membership || fields.some((field) => parentFields.has(field))) && summary.parent !== null) {
			enqueue(ticketDetail(summary.parent.id));
		}
		for (const id of parentsThatLostAChild) enqueue(ticketDetail(id));
		if (!change.deleted) enqueue([forTicket(["timeline", "list"], summary.id)]);
	};

	const applyTicketEvent = (event: TicketEvent) => {
		const change = toChange(event);
		const held = waiting.get(event.summary.id);
		if (held !== undefined && !change.deleted) {
			held.push(change);
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
			// every cached summary and the Needs you sections. No ticket row
			// changes, so no ticket event follows. A project rename alters
			// `project.path` the same way. So every query that holds a summary
			// refetches.
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
			case "agents.session":
				enqueue([family("agents", "sessions")]);
				return;
			case "reset":
				invalidateAll();
				return;
			case "ready":
			case "bye":
			case "agents.batch":
				return;
		}
	};

	const beginMutation = (ticketId: string) => {
		inFlight.set(ticketId, (inFlight.get(ticketId) ?? 0) + 1);
		if (!waiting.has(ticketId)) waiting.set(ticketId, []);
	};

	// The response goes in first, then the held events in version order. A
	// held event at or below the response's version applies nothing.
	const endMutation = (ticketId: string, result?: Ticket) => {
		const remaining = inFlight.get(ticketId)! - 1;
		if (remaining > 0) {
			inFlight.set(ticketId, remaining);
			return;
		}
		inFlight.delete(ticketId);
		const held = waiting.get(ticketId)!;
		waiting.delete(ticketId);
		if (result !== undefined) applyChange(toResultChange(result));
		for (const change of held.sort((a, b) => a.summary.version - b.summary.version)) applyChange(change);
	};

	return { applyEvent, beginMutation, endMutation };
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
