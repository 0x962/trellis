import { z } from "zod";
import { IsoDateTimeSchema, UlidSchema } from "../primitives.ts";
import { SessionRefSchema } from "../session.ts";

export const SessionUpdateEmbedSchema = z.strictObject({
	title: z.string().trim().min(1),
	html: z.string().min(1),
});
export type SessionUpdateEmbed = z.infer<typeof SessionUpdateEmbedSchema>;

export const SessionUpdateSchema = z.strictObject({
	id: UlidSchema,
	sessionId: UlidSchema.nullable(),
	runId: UlidSchema,
	requestId: z.string().uuid().nullable(),
	body: z.string(),
	embeds: z.array(SessionUpdateEmbedSchema),
	createdAt: IsoDateTimeSchema,
});
export type SessionUpdate = z.infer<typeof SessionUpdateSchema>;

export const SessionUpdateRequestStateSchema = z.enum(["pending", "sent", "answered", "failed"]);
export type SessionUpdateRequestState = z.infer<typeof SessionUpdateRequestStateSchema>;

export const SessionUpdateRequestSchema = z.strictObject({
	requestId: z.string().uuid(),
	requestedAt: IsoDateTimeSchema,
	state: SessionUpdateRequestStateSchema,
	error: z.string().nullable(),
});
export type SessionUpdateRequest = z.infer<typeof SessionUpdateRequestSchema>;

export const SessionUpdatesSchema = z.strictObject({
	latest: SessionUpdateSchema.nullable(),
	previous: SessionUpdateSchema.nullable(),
	request: SessionUpdateRequestSchema.nullable(),
});
export type SessionUpdates = z.infer<typeof SessionUpdatesSchema>;

export const SessionUpdatesGetInputSchema = z.strictObject({ sessionId: SessionRefSchema });
export type SessionUpdatesGetInput = z.infer<typeof SessionUpdatesGetInputSchema>;

export const SessionUpdatesWriteInputSchema = SessionUpdatesGetInputSchema.extend({
	requestId: z.string().uuid().optional(),
	body: z.string().refine((body) => body.trim().length > 0, "Write a status update."),
	embeds: z.array(SessionUpdateEmbedSchema).optional(),
});
export type SessionUpdatesWriteInput = z.infer<typeof SessionUpdatesWriteInputSchema>;
