import { z } from "zod";
import { IsoDateTimeSchema } from "./primitives.ts";

export const LoopActionSchema = z.enum(["pause", "resume", "run", "clear"]);
export type LoopAction = z.infer<typeof LoopActionSchema>;
const LoopEntrySchema = z.object({
	id: z.number(),
	at: IsoDateTimeSchema,
	message: z.string(),
	level: z.enum(["info", "error"]),
});
export const LoopStatusSchema = z.object({
	id: z.literal("deterministic-manager"),
	name: z.string(),
	description: z.string(),
	paused: z.boolean(),
	working: z.boolean(),
	step: z.string(),
	runCount: z.number(),
	lastStartedAt: IsoDateTimeSchema.nullable(),
	lastFinishedAt: IsoDateTimeSchema.nullable(),
	nextRunAt: IsoDateTimeSchema.nullable(),
	lastError: z.string().nullable(),
	output: z.array(LoopEntrySchema),
	errors: z.array(LoopEntrySchema),
});
export type LoopStatus = z.infer<typeof LoopStatusSchema>;
