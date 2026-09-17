import { z } from "zod";
import { TicketRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const CommentNotificationSchema = z.object({
	runId: z.string().nullable(),
	personaName: z.string(),
	state: z.enum(["pending", "sending", "sent", "failed", "unknown"]),
	error: z.string().nullable(),
});
export type CommentNotification = z.infer<typeof CommentNotificationSchema>;

const BodySchema = z
	.string()
	.min(1, "Enter a comment of 1 to 200,000 characters.")
	.max(200_000, "Enter a comment of 1 to 200,000 characters.");

export const CommentSchema = z.object({
	id: UlidSchema,
	ticketId: UlidSchema,
	parentId: UlidSchema.nullable().default(null),
	resolvedAt: IsoDateTimeSchema.nullable().default(null),
	body: BodySchema,
	notifications: z.array(CommentNotificationSchema).optional(),
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Comment = z.infer<typeof CommentSchema>;

export const CommentCreateInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	parentId: UlidSchema.optional(),
	body: BodySchema,
	dedupeKey: z.string().trim().min(1).max(200).optional(),
});
export type CommentCreateInput = z.input<typeof CommentCreateInputSchema>;

export const CommentUpdateInputSchema = z.strictObject({
	id: UlidSchema,
	body: BodySchema,
});
export type CommentUpdateInput = z.input<typeof CommentUpdateInputSchema>;

export const CommentIdInputSchema = z.strictObject({
	id: UlidSchema,
});

export const CommentDeleteOutputSchema = z.object({
	deleted: UlidSchema,
});

export const CommentResolveInputSchema = z.strictObject({
	id: UlidSchema,
	resolved: z.boolean(),
});
export type CommentResolveInput = z.input<typeof CommentResolveInputSchema>;

export const CommentThreadSchema = z.object({
	root: CommentSchema,
	replies: z.array(CommentSchema),
});
export type CommentThread = z.infer<typeof CommentThreadSchema>;
