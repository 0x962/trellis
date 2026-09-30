import { z } from "zod";
import { EpicRefStringSchema, ProjectRefStringSchema, WaveRefStringSchema } from "../refs.ts";
import { PrioritySchema } from "./enums.ts";
import { TicketTitleSchema } from "./ticket.ts";

export const TicketClassificationInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	title: TicketTitleSchema,
	description: z.string(),
	epic: EpicRefStringSchema.optional(),
	wave: WaveRefStringSchema.optional(),
});
export type TicketClassificationInput = z.input<typeof TicketClassificationInputSchema>;

export const TicketClassificationSchema = z.object({
	epic: EpicRefStringSchema.nullable(),
	wave: WaveRefStringSchema.nullable(),
	priority: PrioritySchema,
});
export type TicketClassification = z.infer<typeof TicketClassificationSchema>;
