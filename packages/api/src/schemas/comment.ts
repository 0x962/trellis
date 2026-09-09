import { z } from "zod";
import { TicketRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

const BodySchema = z.string().min(1).max(200_000);

export const CommentSchema = z.object({
	id: UlidSchema,
	ticketId: UlidSchema,
	body: BodySchema,
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Comment = z.infer<typeof CommentSchema>;

export const CommentCreateInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	body: BodySchema,
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
