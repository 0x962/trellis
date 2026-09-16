import { z } from "zod";
import { IsoDateTimeSchema } from "./primitives.ts";
import { TicketSummarySchema } from "./ticket.ts";

export const NeedsYouSectionSchema = z.enum(["review", "mentioned"]);
export const NeedsYouVisibilitySchema = z.enum(["active", "snoozed", "ignored"]);
export const NeedsYouSortSchema = z.enum([
	"priority",
	"-priority",
	"createdAt",
	"-createdAt",
	"updatedAt",
	"-updatedAt",
	"title",
	"-title",
]);
export type NeedsYouSort = z.infer<typeof NeedsYouSortSchema>;
export const NeedsYouCursorSchema = z.object({
	query: z.string(),
	key: z.string(),
	age: IsoDateTimeSchema,
	id: z.string().max(200),
});
export const NeedsYouListInputSchema = z.object({
	section: NeedsYouSectionSchema.optional(),
	visibility: NeedsYouVisibilitySchema.default("active"),
	sort: NeedsYouSortSchema.default("priority"),
	ticket: z.string().optional(),
	limit: z.number().int().min(1).max(200).default(50),
	cursor: NeedsYouCursorSchema.nullish(),
});
export type NeedsYouListInput = z.input<typeof NeedsYouListInputSchema>;
export const NeedsYouItemSchema = z.object({
	id: z.string(),
	section: NeedsYouSectionSchema,
	ticket: TicketSummarySchema,
	receivedAt: IsoDateTimeSchema,
	snoozedUntil: IsoDateTimeSchema.nullable(),
	ignored: z.boolean(),
	comment: z.object({ id: z.string(), threadId: z.string(), body: z.string(), actorName: z.string() }).nullable(),
});
export type NeedsYouItem = z.infer<typeof NeedsYouItemSchema>;
export const NeedsYouListOutputSchema = z.object({
	total: z.number().int(),
	items: z.array(NeedsYouItemSchema),
	nextCursor: NeedsYouCursorSchema.nullable(),
});
export type NeedsYouListOutput = z.infer<typeof NeedsYouListOutputSchema>;
export const NeedsYouSummarySchema = z.object({
	active: z.number().int(),
	review: z.number().int(),
	mentioned: z.number().int(),
	snoozed: z.number().int(),
	ignored: z.number().int(),
	nextWakeAt: IsoDateTimeSchema.nullable(),
});
export const NeedsYouUpdateInputSchema = z.discriminatedUnion("action", [
	z.object({ id: z.string().min(1).max(200), action: z.literal("snooze"), until: IsoDateTimeSchema }),
	z.object({ id: z.string().min(1).max(200), action: z.literal("ignore") }),
	z.object({ id: z.string().min(1).max(200), action: z.literal("restore") }),
]);
export type NeedsYouUpdateInput = z.infer<typeof NeedsYouUpdateInputSchema>;
