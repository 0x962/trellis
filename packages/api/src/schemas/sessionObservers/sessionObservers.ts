import { z } from "zod";
import { IsoDateTimeSchema, UlidSchema } from "../primitives.ts";
import { SessionRefSchema } from "../session.ts";
import { SessionUpdateEmbedSchema } from "../sessionUpdates/index.ts";

export const SESSION_OBSERVER_MODEL_ID = "anthropic/claude-sonnet-5.5";
export const SESSION_OBSERVER_ACTIVITY_THRESHOLD = 20;

export const SessionObserverGenerationStateSchema = z.enum(["idle", "generating"]);
export type SessionObserverGenerationState = z.infer<typeof SessionObserverGenerationStateSchema>;

export const SessionObserverMessageSchema = z.strictObject({
	id: UlidSchema,
	observerId: UlidSchema,
	generation: z.number().int().positive(),
	position: z.number().int().nonnegative(),
	role: z.enum(["user", "assistant"]),
	body: z.string().min(1),
	createdAt: IsoDateTimeSchema,
});
export type SessionObserverMessage = z.infer<typeof SessionObserverMessageSchema>;

export const SessionObserverSchema = z.strictObject({
	runId: UlidSchema,
	enabled: z.boolean(),
	observerId: UlidSchema.nullable(),
	providerId: UlidSchema.nullable(),
	modelId: z.string().nullable(),
	activityThreshold: z.number().int().positive(),
	generationState: SessionObserverGenerationStateSchema,
	generation: z.number().int().nonnegative(),
	lastConsumedCursor: z.string().nullable(),
	error: z.string().nullable(),
	messages: z.array(SessionObserverMessageSchema),
});
export type SessionObserver = z.infer<typeof SessionObserverSchema>;

export const SessionObserverMessageInputSchema = SessionObserverMessageSchema.pick({ role: true, body: true });
export type SessionObserverMessageInput = z.infer<typeof SessionObserverMessageInputSchema>;

export const SessionObserverUpdateInputSchema = z.strictObject({
	body: z.string().refine((body) => body.trim().length > 0, "Write a status update."),
	embeds: z.array(SessionUpdateEmbedSchema).optional(),
});
export type SessionObserverUpdateInput = z.infer<typeof SessionObserverUpdateInputSchema>;

export const SessionObserverGetInputSchema = z.strictObject({ sessionId: SessionRefSchema });
export type SessionObserverGetInput = z.infer<typeof SessionObserverGetInputSchema>;

export const SessionObserverSetEnabledInputSchema = SessionObserverGetInputSchema.extend({
	enabled: z.boolean(),
	activityThreshold: z.number().int().positive().optional(),
});
export type SessionObserverSetEnabledInput = z.infer<typeof SessionObserverSetEnabledInputSchema>;
