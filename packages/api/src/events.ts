import { z } from "zod";
import { ActorRefSchema } from "./schemas/actor.ts";
import { CiStateSchema, GhReasonSchema, PrStateSchema } from "./schemas/enums.ts";
import { UlidSchema } from "./schemas/primitives.ts";
import { IdentifierSchema, TicketSummarySchema, TitleSchema } from "./schemas/ticket.ts";

// Every SSE event name. `types=` on the events route takes these and
// `prefix.*` forms.
export const eventNames = [
	"ticket.created",
	"ticket.updated",
	"ticket.deleted",
	"pr.linked",
	"pr.unlinked",
	"pr.updated",
	"comment.created",
	"comment.updated",
	"comment.deleted",
	"attachment.created",
	"attachment.deleted",
	"statuses.changed",
	"project.created",
	"project.updated",
	"project.deleted",
	"project.moved",
	"gh.status",
	"personas.changed",
	"agent-runs.changed",
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

// A reader of the stream acts on the event it reads, so an event about a
// comment, an attachment, or a pull request carries the content of that row.
// The reader needs no second call.

// The longest comment body an event carries. A stored body holds up to
// 200000 characters and the bus keeps the last 1000 events in memory, so a
// full body in every event would hold hundreds of megabytes. A body above
// this limit arrives cut, with `bodyTruncated` set.
export const EVENT_BODY_LIMIT = 2000;

// `ticketIds` are the tickets that link the pull request, and
// `ticketIdentifiers` names the same tickets in the same order.
// `projectIds` are the projects of those tickets, which a project-scoped
// event stream reads.
export const PrEventPayloadSchema = z.object({
	id: UlidSchema,
	ticketIds: z.array(UlidSchema),
	ticketIdentifiers: z.array(IdentifierSchema),
	projectIds: z.array(UlidSchema).optional(),
	owner: z.string().min(1),
	repo: z.string().min(1),
	number: z.number().int().positive(),
	url: z.string().min(1),
	title: z.string(),
	state: PrStateSchema,
	ciState: CiStateSchema,
});

// `id` is the comment or attachment id. `projectId` is the project of the
// ticket, which a project-scoped event stream reads. `ticketIdentifier` and
// `ticketTitle` name the ticket the row sits on, and `actor` the person or
// agent that wrote the row.
export const TicketChildEventPayloadSchema = z.object({
	id: UlidSchema,
	ticketId: UlidSchema,
	ticketIdentifier: IdentifierSchema,
	ticketTitle: TitleSchema,
	projectId: UlidSchema.optional(),
	actor: ActorRefSchema,
});

// `body` is the text of the comment. `bodyTruncated` is true when the stored
// body is longer than `EVENT_BODY_LIMIT`, which tells the reader to read the
// comment itself for the rest.
export const CommentEventPayloadSchema = TicketChildEventPayloadSchema.extend({
	parentId: UlidSchema.nullable().optional(),
	threadId: UlidSchema.optional(),
	resolved: z.boolean().optional(),
	body: z.string().max(EVENT_BODY_LIMIT),
	bodyTruncated: z.boolean(),
});

// `filename` is the name the attachment carries on the ticket.
export const AttachmentEventPayloadSchema = TicketChildEventPayloadSchema.extend({
	filename: z.string().min(1).max(255),
});

export const StatusesChangedPayloadSchema = z.object({
	projectId: UlidSchema,
});

export const ProjectEventPayloadSchema = z.object({
	id: UlidSchema,
});

export const PersonasChangedPayloadSchema = z.object({
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
	typed("attachment.created", AttachmentEventPayloadSchema),
	typed("attachment.deleted", AttachmentEventPayloadSchema),
	typed("statuses.changed", StatusesChangedPayloadSchema),
	typed("project.created", ProjectEventPayloadSchema),
	typed("project.updated", ProjectEventPayloadSchema),
	typed("project.deleted", ProjectEventPayloadSchema),
	typed("project.moved", ProjectEventPayloadSchema),
	typed("gh.status", GhStatusPayloadSchema),
	typed("personas.changed", PersonasChangedPayloadSchema),
	typed("agent-runs.changed", PersonasChangedPayloadSchema),
	typed("reset", ResetPayloadSchema),
	typed("ready", ReadyPayloadSchema),
	typed("bye", ByePayloadSchema),
]);
export type TrellisEvent = z.infer<typeof EventSchema>;

// The payload of one event name, for a typed `emit(type, payload)`.
export type EventPayload<N extends EventName> = Omit<Extract<TrellisEvent, { type: N }>, "type">;
