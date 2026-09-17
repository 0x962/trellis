import { z } from "zod";
import { IsoDateTimeSchema } from "./primitives.ts";

export const LoopActionSchema = z.enum(["pause", "resume", "run", "clear"]);
export type LoopAction = z.infer<typeof LoopActionSchema>;
export const LoopWaitSecondsSchema = z.number().int().min(1).max(3600);
export type LoopWaitSeconds = z.infer<typeof LoopWaitSecondsSchema>;
export const LoopStepIdSchema = z.enum(["wait", "runtime", "workers", "messages"]);
export type LoopStepId = z.infer<typeof LoopStepIdSchema>;
const LoopEntrySchema = z.object({
	id: z.number(),
	stepId: LoopStepIdSchema,
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
	waitSeconds: LoopWaitSecondsSchema,
	steps: z.array(
		z.object({
			id: LoopStepIdSchema,
			title: z.string(),
			description: z.string(),
			active: z.boolean(),
			detail: z.string(),
		}),
	),
	runCount: z.number(),
	lastStartedAt: IsoDateTimeSchema.nullable(),
	lastFinishedAt: IsoDateTimeSchema.nullable(),
	nextRunAt: IsoDateTimeSchema.nullable(),
	lastError: z.string().nullable(),
	output: z.array(LoopEntrySchema),
	errors: z.array(LoopEntrySchema),
});
export type LoopStatus = z.infer<typeof LoopStatusSchema>;
