import { z } from "zod";
import { TicketRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// `url` is where the bytes are served: `/api/attachments/{id}/file`. The
// blob on disk is addressed by `sha256`, so two uploads of one file share it.
export const AttachmentSchema = z.object({
	id: UlidSchema,
	ticketId: UlidSchema,
	filename: z.string().min(1).max(255),
	mime: z.string().min(1),
	size: z.number().int().positive(),
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	url: z.string().min(1),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const AttachmentListInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
});

// `name` replaces the file's own name when set.
export const AttachmentUploadInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	file: z.file(),
	name: z.string().min(1).max(255).optional(),
});
export type AttachmentUploadInput = z.input<typeof AttachmentUploadInputSchema>;

// `markdown` is the line to paste into a description or a comment.
export const AttachmentUploadOutputSchema = z.object({
	attachment: AttachmentSchema,
	url: z.string().min(1),
	markdown: z.string().min(1),
});
export type AttachmentUploadOutput = z.infer<typeof AttachmentUploadOutputSchema>;

export const AttachmentIdInputSchema = z.strictObject({
	id: UlidSchema,
});

export const AttachmentDeleteOutputSchema = z.object({
	deleted: UlidSchema,
});
