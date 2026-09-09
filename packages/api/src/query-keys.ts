import type { Query, QueryClient } from "@tanstack/query-core";
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

// How long a deleted ticket's id stays tombstoned. A create or update for
// the id that arrives inside this window applies nothing. Such an event is
// a straggler that the server emitted before the delete's commit.
export const TOMBSTONE_MS = 60_000;

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

export type EventApplier = {
	applyEvent: (event: unknown) => void;
	beginMutation: (ticketId: string) => void;
	endMutation: (ticketId: string) => void;
};

// Patch first, invalidate rarely. A `ticket.*` event visits every cached
// list, board, inbox section, search result, and detail that holds the
// ticket. An entry takes the event's summary only when the event's version
// is higher than the entry's own, and then its version equals the event's.
// The compare is per entry, so an older event never overwrites a newer
// field and never lowers a version. No other version bookkeeping exists.
// A queued invalidation never blocks a patch, and neither does a refetch in
// flight: the patch lands and the refetch's result replaces it. The detail
// holds the description, which a summary lacks. A description event moves
// the detail to its version, sets `descriptionStale`, and queues the
// detail's refetch. The refetch replaces the whole entry, which clears the
// flag. Invalidations queue in two coalescers, one for the inbox and one
// for the rest, and each flush is one `invalidateQueries` call. While a
// mutation is in flight for a ticket, its events wait. After the mutation
// settles they apply in version order, so the mutation's own response
// never overwrites a newer row. A delete is final: every query that names
// the ticket is cancelled and removed, so a fetch in flight never lands,
// and the id is tombstoned for `TOMBSTONE_MS`. A create or update for a
// tombstoned id applies nothing.
export const createEventApplier = (queryClient: QueryClient, options: { scheduler?: Scheduler } = {}): EventApplier => {
	const scheduler = options.scheduler ?? realScheduler;
	const general = createInvalidationCoalescer(queryClient, scheduler);
	const inbox = createInvalidationCoalescer(queryClient, scheduler, {
		trailingMs: INBOX_TRAILING_MS,
		maxWaitMs: INBOX_MAX_WAIT_MS,
	});
	const inFlight = new Map<string, number>();
	const waiting = new Map<string, HeldChange[]>();
	// The time of each delete, by ticket id. An entry older than
	// `TOMBSTONE_MS` is expired, and every delete prunes the expired ones.
	const tombstones = new Map<string, number>();

	const isTombstoned = (id: string) => {
		const deletedAt = tombstones.get(id);
		return deletedAt !== undefined && scheduler.now() - deletedAt < TOMBSTONE_MS;
	};

	const tombstone = (id: string) => {
		const now = scheduler.now();
		for (const [other, deletedAt] of tombstones) if (now - deletedAt >= TOMBSTONE_MS) tombstones.delete(other);
		tombstones.set(id, now);
	};

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

	// Cancels and removes every query that names the ticket: a detail whose
	// data carries the id, and any query whose input holds the ULID or the
	// identifier. The cancel comes first, so a fetch in flight is dropped
	// before its result can reach the cache. An input ref keeps the spelling
	// the caller used, so the compare is upper-case.
	const dropTicketQueries = (summary: TicketChange["summary"]) => {
		const refs = new Set([summary.id, summary.identifier.toUpperCase()]);
		const namesTicket = (query: Query) => {
			const input = (query.queryKey[1] as { input?: Record<string, unknown> } | undefined)?.input;
			const inInput =
				input !== undefined &&
				Object.values(input).some((value) => typeof value === "string" && refs.has(value.toUpperCase()));
			return (
				inInput || (isDetail(query.queryKey) && (query.state.data as { id?: unknown } | undefined)?.id === summary.id)
			);
		};
		const targets = new Set(queryClient.getQueryCache().getAll().filter(namesTicket));
		if (targets.size === 0) return;
		const predicate = (query: Query) => targets.has(query);
		void queryClient.cancelQueries({ predicate });
		queryClient.removeQueries({ predicate });
	};

	// Returns the id of every cached parent whose `children` lost a row. One
	// change walks the cache once, however many queries the cache holds. A
	// query that was invalidated before the patch refetches once more after
	// it, because `setQueryData` clears the invalidated flag. A query with
	// a fetch in flight refetches once more too, whatever started the fetch.
	// That fetch can bring rows read before the event's commit. A detail
	// that took a description event refetches, so the text catches up.
	const patchTicket = (change: TicketChange) => {
		const parentsThatLostAChild: string[] = [];
		const id = change.summary.id;
		const description = change.fields.includes("description");
		for (const query of queryClient.getQueryCache().getAll()) {
			const data = query.state.data;
			if (data === undefined) continue;
			const detail = isDetail(query.queryKey);
			const own = detail && (data as { id: unknown }).id === id;
			const patched = patchTicketQuery(query.queryKey, data, change);
			if (patched === undefined) continue;
			const refetches = query.state.isInvalidated || query.state.fetchStatus === "fetching";
			queryClient.setQueryData(query.queryKey, patched);
			if (refetches || (own && description)) enqueue([forQuery(query)]);
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
			tombstone(summary.id);
			dropTicketQueries(summary);
		} else if (isTombstoned(summary.id)) {
			return;
		}
		const parentsThatLostAChild = patchTicket(change);
		const membership = change.created || change.deleted;
		if (membership || fields.some((field) => membershipFields.has(field))) enqueue(membershipMatchers);
		if ((membership || fields.some((field) => parentFields.has(field))) && summary.parent !== null) {
			enqueue(ticketDetail(summary.parent.id));
		}
		for (const id of parentsThatLostAChild) enqueue(ticketDetail(id));
		if (!change.deleted) enqueue([forTicket(["timeline", "list"], summary.id)]);
	};

	const applyTicketEvent = (event: TicketEvent) => {
		const id = event.summary.id;
		const change = toChange(event);
		const held = waiting.get(id);
		if (held !== undefined) {
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
		if (!waiting.has(ticketId)) waiting.set(ticketId, []);
	};

	// The held events apply in version order. Two events at one version keep
	// their arrival order, so an update and then a delete still delete.
	const endMutation = (ticketId: string) => {
		const remaining = inFlight.get(ticketId)! - 1;
		if (remaining > 0) {
			inFlight.set(ticketId, remaining);
			return;
		}
		inFlight.delete(ticketId);
		const held = waiting.get(ticketId)!;
		waiting.delete(ticketId);
		for (const change of held.sort((a, b) => a.summary.version - b.summary.version)) applyChange(change);
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
