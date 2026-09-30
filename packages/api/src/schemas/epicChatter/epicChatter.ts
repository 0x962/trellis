import { z } from "zod";
import { EpicRefStringSchema } from "../../refs.ts";
import { IsoDateTimeSchema, UlidSchema } from "../primitives.ts";

export const EpicChatterInputSchema = z.strictObject({ epic: EpicRefStringSchema });
export const EpicChatterSettingsSchema = z.strictObject({ epicId: UlidSchema, enabled: z.boolean() });
export const EpicChatterSetInputSchema = EpicChatterInputSchema.extend({ enabled: z.boolean() });
export const ChatterMessageSchema = z.strictObject({
	id: UlidSchema,
	senderId: z.string(),
	senderName: z.string(),
	recipientId: UlidSchema,
	recipientName: z.string(),
	text: z.string(),
	state: z.enum(["pending", "sent", "queued", "skipped", "unconfirmed"]),
	createdAt: IsoDateTimeSchema,
});
export const EpicChatterListInputSchema = EpicChatterInputSchema.extend({ before: UlidSchema.optional() });
export const EpicChatterPageSchema = z.strictObject({
	items: z.array(ChatterMessageSchema),
	nextCursor: UlidSchema.nullable(),
});
export type ChatterMessage = z.infer<typeof ChatterMessageSchema>;
