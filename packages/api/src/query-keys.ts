import type { QueryClient } from "@tanstack/query-core";
import { dropTicketQueries } from "./dropTicketQueries.ts";
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
import type { CommentThread } from "./schemas/comment.ts";
import { summaryOf, type Ticket, ticketContractFields } from "./schemas/ticket.ts";
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
// that the summary omits, such as `answeredQuestions` after an `after` change.
const detailFields: ReadonlySet<string> = new Set(["description", ...ticketContractFields, "outcome", "after"]);

// A summary event cannot patch these values. Remove the detail so a reader
// cannot pair old values with the event's newer version.
const replaceDetailFields: ReadonlySet<string> = new Set([...ticketContractFields, "outcome"]);

type TicketEvent = Extract<TrellisEvent, { type: "ticket.created" | "ticket.updated" | "ticket.deleted" }>;

// A ticket change with the event kind the cache reacts to.
type HeldChange = TicketChange & { created: boolean };

// The projects list carries `openCount`, and no
// project event follows a ticket change. So it refetches with the lists.
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
	// timeline lists activity beside the comments. So the ticket's timeline
	// refetches on every change but a delete, which drops the ticket page.
	const applyChange = (change: HeldChange) => {
		const { summary, fields } = change;
		enqueue([family("needsYou")]);
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
			case "comment.created":
			case "comment.updated":
			case "comment.deleted": {
				enqueue([family("needsYou")]);
				const threads = queryClient
					.getQueryCache()
					.findAll({ queryKey: [["comments", "thread"]] })
					.filter((query) => {
						const data = query.state.data as CommentThread | undefined;
						const input = (query.queryKey[1] as { input: { id: string } }).input;
						return data?.root.ticketId === event.ticketId || input.id === event.id || input.id === event.threadId;
					});
				enqueue([
					forTicket(["timeline", "list"], event.ticketId),
					...ticketDetail(event.ticketId),
					...threads.map(forQuery),
				]);
				return;
			}
			case "attachment.created":
			case "attachment.deleted":
				enqueue([forTicket(["attachments", "list"], event.ticketId), ...ticketDetail(event.ticketId)]);
				return;
			// A sub-project lists the notes of its ancestors too, so every note
			// list refetches.
			case "notes.changed":
				enqueue([family("notes")]);
				return;
			// A ticket row copies the name and the ref of its epic and of its
			// wave, and the projects list carries `openEpicCount`. No
			// ticket event follows a change of an epic or of a wave, so
			// every query that holds a ticket row refetches.
			case "epics.changed":
				enqueue([family("epics"), family("tickets"), family("projects", "list")]);
				return;
			// The Diffs page of a project lists pull requests by their ticket
			// links, so a link change refetches that list too.
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
					family("reviews", "prs"),
				]);
				return;
			// Every cached summary holds the name, the color, and the group name
			// of each label on its ticket. A rename, a new color, a move to a
			// group, or a delete alters those values, and no ticket row changes,
			// so no ticket event follows. So every query that holds a summary
			// refetches with the label list.
			case "labels.changed":
				enqueue([family("labels"), family("tickets"), family("search"), family("needsYou")]);
				return;
			// A status rename or a reviewer change alters the `status` inside
			// every cached summary. No ticket row changes, so no ticket event
			// follows. A project rename alters
			// `project.path` the same way. So every query that holds a summary
			// refetches.
			case "statuses.changed":
			case "project.created":
			case "project.updated":
			case "project.deleted":
			case "project.moved":
				enqueue([family("statuses"), family("projects"), family("tickets"), family("search"), family("needsYou")]);
				return;
			case "needs-you.changed":
				enqueue([family("needsYou")]);
				return;
			case "gh.status":
				enqueue([family("system", "gh")]);
				return;
			// A session detail carries the state of its run, so a run change
			// refetches the sessions with the runs.
			case "agent-runs.status":
			case "agent-runs.changed":
				enqueue([family("agentRuns"), family("sessions")]);
				return;
			case "sessions.changed":
				enqueue([family("sessions")]);
				return;
			case "reviews.changed":
				enqueue([family("reviews")]);
				return;
			// A flow run stores its state under flowExecutions, and every state
			// write emits flows.changed with the flow id.
			case "flows.changed":
				enqueue([family("flows"), family("flowExecutions")]);
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
