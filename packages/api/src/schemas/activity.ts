import { z } from "zod";
import { TicketRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { CommentSchema } from "./comment.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// The `action` of an activity row, as the server writes it. A client that
// finds the create row of a ticket compares against `created`. The two
// `subprojectManager` rows sit on a parent project with a null ticket: a
// sub-project of that parent set or cleared its own manager instruction, and
// `meta.projectId` and `to_value` name that sub-project.
export const activityActions = {
	created: "ticket.created",
	updated: "ticket.updated",
	deleted: "ticket.deleted",
	subprojectManagerEnabled: "project.subproject_manager_enabled",
	subprojectManagerDisabled: "project.subproject_manager_disabled",
} as const;

// One audit row. `id` is the bigint identity, the cursor and the sort key.
// A description row carries `meta.deltaChars` and no values; a status row
// carries `{fromId, toId, fromCategory, toCategory}` in `meta`.
export const ActivitySchema = z.object({
	id: z.number().int().positive(),
	batchId: UlidSchema,
	rootId: UlidSchema,
	projectId: UlidSchema,
	ticketId: UlidSchema.nullable(),
	actor: ActorRefSchema,
	action: z.string().min(1),
	field: z.string().nullable(),
	fromValue: z.string().nullable(),
	toValue: z.string().nullable(),
	meta: z.record(z.string(), z.unknown()),
	createdAt: IsoDateTimeSchema,
});
export type Activity = z.infer<typeof ActivitySchema>;

// The ticket page reads comments and activity as one stream, newest first.
export const TimelineItemSchema = z.discriminatedUnion("kind", [
	CommentSchema.extend({ kind: z.literal("comment") }),
	ActivitySchema.extend({ kind: z.literal("activity") }),
]);
export type TimelineItem = z.infer<typeof TimelineItemSchema>;

// `before` is the cursor from the previous page.
export const TimelineListInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	before: z.string().optional(),
	limit: z.coerce
		.number()
		.int("Enter a whole number for the limit.")
		.min(1, "Enter a limit of 1 to 100.")
		.max(100, "Enter a limit of 1 to 100.")
		.default(100),
});
export type TimelineListInput = z.input<typeof TimelineListInputSchema>;

export const TimelineListOutputSchema = z.object({
	items: z.array(TimelineItemSchema),
	nextCursor: z.string().nullable(),
});
export type TimelineListOutput = z.infer<typeof TimelineListOutputSchema>;
