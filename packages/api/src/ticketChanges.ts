import type { TrellisEvent } from "./events.ts";
import { family, type Matcher } from "./invalidationCoalescer.ts";
import type { Ticket } from "./schemas/ticket.ts";
import type { TicketChange } from "./ticketPatches.ts";

// What the event applier needs to know about one ticket change: which
// fields moved, whether the change can move the ticket into or out of a
// filtered list, and which queries such a change refetches.

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
export const parentFields: ReadonlySet<string> = new Set(["parent", "status", "completedAt"]);

export type TicketEvent = Extract<TrellisEvent, { type: "ticket.created" | "ticket.updated" | "ticket.deleted" }>;

// A ticket change with the event kind the cache reacts to.
export type HeldChange = TicketChange & { created: boolean };

// The projects list carries `openCount` and `needsYouCount`, and no
// project event follows a ticket change. So it refetches with the lists.
export const membershipMatchers = [
	family("tickets", "list"),
	family("tickets", "board"),
	family("tickets", "counts"),
	family("inbox", "get"),
	family("projects", "list"),
];

export const isInboxMatcher = (matcher: Matcher) => matcher.path[0] === "inbox";

// True when the change can move a ticket into or out of a filtered list.
export const changesMembership = (change: HeldChange) =>
	change.created || change.deleted || change.fields.some((field) => membershipFields.has(field));

export const toChange = (event: TicketEvent): HeldChange => ({
	summary: event.summary,
	fields: event.fields,
	deleted: event.type === "ticket.deleted",
	created: event.type === "ticket.created",
});

// A mutation's response names no fields. The event for the same write
// carries them, and it arrives held or after the response.
export const toResultChange = (result: Ticket): HeldChange => {
	const { description, children, prs, attachments, descriptionStale, ...summary } = result;
	return { summary, fields: [], deleted: false, created: false, detail: result };
};

export const childCount = (detail: unknown) => (detail as { children: unknown[] }).children.length;
