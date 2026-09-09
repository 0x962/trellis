import type { QueryClient } from "@tanstack/query-core";
import { EventSchema, type TrellisEvent } from "./events.ts";
import { byInput, createInvalidationCoalescer, family, ticketDetail } from "./invalidationCoalescer.ts";
import { realScheduler, type Scheduler } from "./scheduler.ts";
import { patchTicketQuery, type TicketChange } from "./ticketPatches.ts";

export { MAX_WAIT_MS, TRAILING_MS } from "./invalidationCoalescer.ts";
export { realScheduler, type Scheduler } from "./scheduler.ts";

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

// A ticket change with the event kind the cache reacts to.
type HeldChange = TicketChange & { created: boolean };

const membershipMatchers = [
	family("tickets", "list"),
	family("tickets", "board"),
	family("tickets", "counts"),
	family("inbox", "get"),
];

const toChange = (event: TicketEvent): HeldChange => ({
	summary: event.summary,
	fields: event.fields,
	deleted: event.type === "ticket.deleted",
	created: event.type === "ticket.created",
});

// Two changes to one ticket fold into one: the highest version wins the row,
// every named field stays named, and a delete or a create stays visible.
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
// ticket, and only when the incoming version is higher. Invalidations queue
// in a coalescer and flush as one `invalidateQueries` call. While a mutation
// is in flight for a ticket, its events wait, folded into one change, and
// apply after the mutation settles, so the mutation's own response never
// overwrites a newer row.
export const createEventApplier = (queryClient: QueryClient, options: { scheduler?: Scheduler } = {}): EventApplier => {
	const scheduler = options.scheduler ?? realScheduler;
	const { enqueue, invalidateAll } = createInvalidationCoalescer(queryClient, scheduler);
	const inFlight = new Map<string, number>();
	const waiting = new Map<string, HeldChange>();

	const patchTicket = (change: TicketChange) => {
		for (const query of queryClient.getQueryCache().getAll()) {
			const data = query.state.data;
			if (data === undefined) continue;
			if (change.deleted && (data as { id?: unknown }).id === change.summary.id && isDetail(query.queryKey)) {
				queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
				continue;
			}
			const patched = patchTicketQuery(query.queryKey, data, change);
			if (patched !== undefined) queryClient.setQueryData(query.queryKey, patched);
		}
	};

	// A create, a delete, and a parent change alter the parent's `children`
	// and its child counts, so the parent's detail refetches.
	const applyChange = (change: HeldChange) => {
		const { summary, fields } = change;
		patchTicket(change);
		const membership = change.created || change.deleted;
		if (membership || fields.some((field) => membershipFields.has(field))) enqueue(membershipMatchers);
		if ((membership || fields.includes("parent")) && summary.parent !== null) enqueue(ticketDetail(summary.parent.id));
		if (fields.includes("description")) enqueue(ticketDetail(summary.id));
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
		if (held !== undefined) applyChange(held);
	};

	return { applyEvent, beginMutation, endMutation };
};

// True for a `tickets.get` key: `[["tickets", "get"], options]`.
const isDetail = (queryKey: readonly unknown[]) => {
	const path = queryKey[0];
	return Array.isArray(path) && path.join(".") === "tickets.get";
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
