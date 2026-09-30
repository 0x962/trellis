import { z } from "zod";
import { HarnessPresetSchema } from "../harness/harness.ts";
import { ModelIdSchema } from "../models/models.ts";
import { EpicRefStringSchema, ProjectRefStringSchema, WaveRefStringSchema } from "../refs.ts";
import { PrioritySchema } from "./enums.ts";
import { TicketTitleSchema } from "./ticket.ts";

export const TicketClassificationInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	title: TicketTitleSchema,
	description: z.string(),
	epic: EpicRefStringSchema.optional(),
	wave: WaveRefStringSchema.optional(),
	harness: HarnessPresetSchema.exclude(["custom"]).optional(),
});
export type TicketClassificationInput = z.input<typeof TicketClassificationInputSchema>;

export const TicketDifficultySchema = z.enum(["low", "medium", "high"]);

export const TicketClassificationSchema = z.object({
	epic: EpicRefStringSchema.nullable(),
	wave: WaveRefStringSchema.nullable(),
	priority: PrioritySchema,
	difficulty: TicketDifficultySchema,
	model: ModelIdSchema.nullable(),
});
export type TicketClassification = z.infer<typeof TicketClassificationSchema>;
