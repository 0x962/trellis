import type { QueryClient } from "@tanstack/query-core";
import { dropTicketQueries } from "./dropTicketQueries.ts";
import { eventInvalidations } from "./eventInvalidations";
import { EventSchema, type TrellisEvent } from "./events.ts";
import {
	createInvalidationCoalescer,
	family,
	forQuery,
	forTicket,
	type Matcher,
	ticketDetail,
} from "./invalidationCoalescer.ts";
import { realScheduler, type Scheduler } from "./scheduler.ts";
import type { TicketSummary } from "./schemas/ticket.ts";
import { summaryOf, type Ticket, ticketContractFields } from "./schemas/ticket.ts";
import { createSettleCheck } from "./settleCheck.ts";
import { createSummaryBatchApplier } from "./summaryBatch/index.ts";
import {
	holdsTicketRow,
	holdsTicketRows,
	isCounts,
	isDetail,
	patchTicketQuery,
	type TicketChange,
} from "./ticketPatches.ts";
import { createTombstones } from "./tombstones.ts";

export { MAX_WAIT_MS, TRAILING_MS } from "./invalidationCoalescer.ts";
export { realScheduler, type Scheduler } from "./scheduler.ts";
export { TOMBSTONE_MS } from "./tombstones.ts";

// A patch keeps a row current. A filtered list cannot know whether the row
// still belongs to it after one of these fields changes. Only these fields,
// and a create or a delete, refetch the lists.
export const membershipFields: ReadonlySet<string> = new Set([
	"status",
	"project",
	"priority",
	"labels",
	"parent",
	"after",
	"epic",
	"wave",
	"completed",
	"completedAt",
	"position",
]);

// A parent's `childDoneCount` and `children` change when a child completes
// or moves. The parent row emits no event of its own, so its detail refetches.
const parentFields: ReadonlySet<string> = new Set(["parent", "status", "completedAt"]);

// The counts, turns, and state of an epic and its waves derive from tickets.
// A ticket change emits no epic event, so these fields refetch epic queries.
const epicFields: ReadonlySet<string> = new Set(["epic", "wave", "status", "completedAt", "after"]);

// A ticket event carries only the summary. These fields change detail data
// that the summary omits.
const detailFields: ReadonlySet<string> = new Set(["description", ...ticketContractFields, "outcome", "after"]);

// A summary event cannot patch these values. Remove the detail so a reader
// cannot pair old values with the event's newer version.
const replaceDetailFields: ReadonlySet<string> = new Set([...ticketContractFields, "outcome"]);

type TicketEvent = Extract<TrellisEvent, { type: "ticket.created" | "ticket.updated" | "ticket.deleted" }>;

// A ticket change with the event kind the cache reacts to.
type HeldChange = TicketChange & { created: boolean };

// A ticket change alters `openEpicCount` on a project row, which the sidebar
// draws beside Epics. The server sends no project event for that change, so
// the projects list refetches together with the ticket lists named below.
const membershipMatchers = [
	family("tickets", "list"),
	family("tickets", "board"),
	family("tickets", "counts"),
	family("projects", "list"),
];

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
	return { summary: summaryOf(result), fields: [], deleted: false, created: false, detail: result };
};

export type EventApplier = {
	applyEvent: (event: unknown) => void;
	applySummaries: (summaries: readonly TicketSummary[], deleted?: boolean) => readonly TicketSummary[];
	beginMutation: (ticketId: string) => void;
	endMutation: (ticketId: string, result?: Ticket) => void;
};

// Cached ticket rows accept only a higher version.
// `createSettleCheck` refetches rows that miss changes during a request.
// A change to a field in `detailFields` refetches the detail, because a ticket event carries only the summary.
// Ticket writes hold events until the mutation response enters the cache.
// Deleted ticket IDs block late responses for `TOMBSTONE_MS`.
export const createEventApplier = (queryClient: QueryClient, options: { scheduler?: Scheduler } = {}): EventApplier => {
	const scheduler = options.scheduler ?? realScheduler;
	const coalescer = createInvalidationCoalescer(queryClient, scheduler);
	const inFlight = new Map<string, number>();
	const waiting = new Map<string, HeldChange[]>();
	const tombstones = createTombstones(scheduler);
	const settle = createSettleCheck(queryClient);

	const enqueue = (matchers: Matcher[]) => {
		if (matchers.length > 0) coalescer.enqueue(matchers);
	};

	const invalidateAll = () => coalescer.invalidateAll();

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
	// took a change to one of the `detailFields` refetches, so the ticket page
	// shows the new values.
	const patchTicket = (change: HeldChange) => {
		const parentsThatLostAChild: string[] = [];
		const { id } = change.summary;
		const detailChanged = change.fields.some((field) => detailFields.has(field));
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
			const replaceDetail = own && change.fields.some((field) => replaceDetailFields.has(field));
			if (replaceDetail) {
				queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
				continue;
			}
			const patched = patchTicketQuery(query.queryKey, data, change);
			if (settles) settle.record(query, change, holdsTicketRow(query.queryKey, data, id));
			if (patched === undefined) continue;
			const invalidated = query.state.isInvalidated;
			queryClient.setQueryData(query.queryKey, patched);
			if (!fetching && (invalidated || (own && detailChanged))) enqueue([forQuery(query)]);
			if (detail && childCount(patched) < childCount(data)) parentsThatLostAChild.push((data as { id: string }).id);
		}
		return parentsThatLostAChild;
	};

	// The server writes an activity row for every ticket change, and the
	// timeline lists that activity. So the ticket's timeline refetches on
	// every change but a delete, which drops the ticket page.
	const applyChange = (change: HeldChange) => {
		const { summary, fields } = change;
		enqueue([family("needsYou")]);
		if (change.deleted) {
			tombstones.add(summary.id);
			dropTicketQueries(queryClient, [summary]);
		} else if (tombstones.has(summary.id)) {
			return;
		}
		const parentsThatLostAChild = patchTicket(change);
		if (change.deleted || fields.some((field) => ["after", "status", "title", "project"].includes(field))) {
			enqueue([family("tickets", "dependencies")]);
		}
		const membership = change.created || change.deleted;
		if (changesMembership(change)) enqueue(membershipMatchers);
		if ((membership || fields.some((field) => parentFields.has(field))) && summary.parent !== null) {
			enqueue(ticketDetail(summary.parent.id));
		}
		if ((membership && summary.epic !== null) || fields.some((field) => epicFields.has(field))) {
			enqueue([family("epics")]);
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
			case "reset":
				invalidateAll();
				return;
			case "ready":
			case "bye":
				return;
			default:
				enqueue(eventInvalidations(event));
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

	const applySummaries = createSummaryBatchApplier(queryClient, {
		enqueue,
		settle,
		tombstones,
		hold: (summary) => {
			const held = waiting.get(summary.id);
			if (held === undefined) return false;
			held.push({ summary, fields: [], deleted: false, created: false });
			return true;
		},
	});
	return { applyEvent, applySummaries, beginMutation, endMutation };
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
