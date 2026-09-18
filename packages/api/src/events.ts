import { z } from "zod";
import { CiStateSchema, GhReasonSchema, PrStateSchema } from "./schemas/enums.ts";
import { UlidSchema } from "./schemas/primitives.ts";
import { SessionDetailSchema } from "./schemas/session.ts";
import { TicketSummarySchema } from "./schemas/ticket.ts";

// Every SSE event name. `types=` on the events route takes these and
// `prefix.*` forms.
export const eventNames = [
	"needs-you.changed",
	"ticket.created",
	"ticket.updated",
	"ticket.deleted",
	"pr.linked",
	"pr.unlinked",
	"pr.updated",
	"comment.created",
	"comment.updated",
	"comment.deleted",
	"notes.changed",
	"epics.changed",
	"attachment.created",
	"attachment.deleted",
	"statuses.changed",
	"project.created",
	"project.updated",
	"project.deleted",
	"project.moved",
	"gh.status",
	"labels.changed",
	"flows.changed",
	"reviews.changed",
	"agent-runs.changed",
	"sessions.changed",
	"sessions.status",
	"reset",
	"ready",
	"bye",
] as const;
export type EventName = (typeof eventNames)[number];

// An event id is `<bootId>.<seq>`: the ULID minted at server boot and a
// sequence that starts at 0 on every boot. A client that reconnects with an
// id from another boot gets `reset`. The sequence has at most 15 digits.
// Every 15-digit number is below 2^53, so `Number` keeps each digit.
const eventIdPattern = /^[0-7][0-9A-HJKMNP-TV-Z]{25}\.(0|[1-9][0-9]{0,14})$/;

export const EventIdSchema = z.string().regex(eventIdPattern, "Expected an event id: <bootId ULID>.<seq>.");

export type EventId = { bootId: string; seq: number };

export const parseEventId = (id: string): EventId => {
	const [bootId, seq] = EventIdSchema.parse(id).split(".");
	return { bootId: bootId!, seq: Number(seq) };
};

export const formatEventId = ({ bootId, seq }: EventId) => `${bootId}.${seq}`;

// `fields` names the ticket columns the change touched; `batchId` groups the
// rows one transaction wrote.
export const TicketEventPayloadSchema = z.object({
	summary: TicketSummarySchema,
	fields: z.array(z.string()),
	batchId: UlidSchema,
});

// `ticketIds` are the tickets that link the pull request. `projectIds` are
// the projects of those tickets, which a project-scoped event stream reads.
export const PrEventPayloadSchema = z.object({
	id: UlidSchema,
	ticketIds: z.array(UlidSchema),
	projectIds: z.array(UlidSchema).optional(),
	state: PrStateSchema,
	ciState: CiStateSchema,
});

// `id` is the comment or attachment id. `projectId` is the project of the
// ticket, which a project-scoped event stream reads.
export const TicketChildEventPayloadSchema = z.object({
	id: UlidSchema,
	ticketId: UlidSchema,
	projectId: UlidSchema.optional(),
});

export const CommentEventPayloadSchema = TicketChildEventPayloadSchema.extend({
	parentId: UlidSchema.nullable().optional(),
	threadId: UlidSchema.optional(),
	resolved: z.boolean().optional(),
});

export const StatusesChangedPayloadSchema = z.object({
	projectId: UlidSchema,
});

// `projectId` is the project that owns the created, changed, or deleted note.
// Every project below it reads that note too, so a client refetches every
// note list.
export const NotesChangedPayloadSchema = z.object({
	projectId: UlidSchema,
});

// `id` is the epic that a committed create, update, or delete touched, and
// `projectId` the project that owns it. A create, an update, a reorder, and
// a delete of a milestone name the epic of that milestone. The counts of an
// epic follow its tickets, and a ticket event carries those; this event
// carries the record.
export const EpicsChangedPayloadSchema = z.object({
	projectId: UlidSchema,
	id: UlidSchema,
});

export const ProjectEventPayloadSchema = z.object({
	id: UlidSchema,
});

export const AgentChangedPayloadSchema = z.object({
	id: UlidSchema,
});

// `id` is the flow that a committed mutation created, changed, or deleted.
export const FlowsChangedPayloadSchema = z.object({
	id: UlidSchema,
});

// `reason` is present when `ok` is false.
export const GhStatusPayloadSchema = z.object({
	ok: z.boolean(),
	reason: GhReasonSchema.optional(),
});

// `restart`: the id came from another boot. `gap`: the id fell below the
// ring buffer floor. Either way the client invalidates every query.
export const ResetPayloadSchema = z.object({
	reason: z.enum(["restart", "gap"]),
});

// `id` is the stream position the client resumes from.
export const ReadyPayloadSchema = z.object({
	id: EventIdSchema,
	bootId: UlidSchema,
	serverVersion: z.string(),
	apiVersion: z.string(),
});

export const ByePayloadSchema = z.object({
	reason: z.enum(["shutdown"]),
});

const typed = <N extends EventName, S extends z.ZodRawShape>(type: N, payload: z.ZodObject<S>) =>
	payload.extend({ type: z.literal(type) });

// The SSE `event:` name as `type`, the `data:` body as the rest. The event
// id travels in the SSE `id:` line, so it is not a field here.
export const EventSchema = z.discriminatedUnion("type", [
	typed("ticket.created", TicketEventPayloadSchema),
	typed("ticket.updated", TicketEventPayloadSchema),
	typed("ticket.deleted", TicketEventPayloadSchema),
	typed("pr.linked", PrEventPayloadSchema),
	typed("pr.unlinked", PrEventPayloadSchema),
	typed("pr.updated", PrEventPayloadSchema),
	typed("comment.created", CommentEventPayloadSchema),
	typed("comment.updated", CommentEventPayloadSchema),
	typed("comment.deleted", CommentEventPayloadSchema),
	typed("notes.changed", NotesChangedPayloadSchema),
	typed("epics.changed", EpicsChangedPayloadSchema),
	typed("attachment.created", TicketChildEventPayloadSchema),
	typed("attachment.deleted", TicketChildEventPayloadSchema),
	typed("statuses.changed", StatusesChangedPayloadSchema),
	typed("labels.changed", StatusesChangedPayloadSchema),
	typed("project.created", ProjectEventPayloadSchema),
	typed("project.updated", ProjectEventPayloadSchema),
	typed("project.deleted", ProjectEventPayloadSchema),
	typed("project.moved", ProjectEventPayloadSchema),
	typed("gh.status", GhStatusPayloadSchema),
	typed("flows.changed", FlowsChangedPayloadSchema),
	typed(
		"reviews.changed",
		z.object({ id: UlidSchema, ticketIds: z.array(UlidSchema), projectIds: z.array(UlidSchema) }),
	),
	typed("agent-runs.changed", AgentChangedPayloadSchema),
	typed("sessions.changed", AgentChangedPayloadSchema),
	typed("sessions.status", z.object({ session: SessionDetailSchema, notify: z.boolean() })),
	typed("needs-you.changed", z.object({ actorName: z.string() })),
	typed("reset", ResetPayloadSchema),
	typed("ready", ReadyPayloadSchema),
	typed("bye", ByePayloadSchema),
]);
export type TrellisEvent = z.infer<typeof EventSchema>;

// The payload of one event name, for a typed `emit(type, payload)`.
export type EventPayload<N extends EventName> = Omit<Extract<TrellisEvent, { type: N }>, "type">;
