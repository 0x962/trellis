import { z } from "zod";
import { IsoDateTimeSchema, UlidSchema } from "../primitives.ts";
import { SessionRefSchema } from "../session.ts";
import { SessionUpdateEmbedSchema } from "../sessionUpdates/index.ts";

export const SESSION_OBSERVER_MODEL_ID = "anthropic/claude-sonnet-5.5";
export const SESSION_OBSERVER_ACTIVITY_THRESHOLD = 20;
export const SESSION_OBSERVER_HARNESS_PRESET = "claude";

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

export const SessionObserverErrorCodeSchema = z.enum([
	"CLAUDE_ACCOUNT_UNAVAILABLE",
	"CLAUDE_PROFILE_UNAVAILABLE",
	"CLAUDE_MODEL_UNAVAILABLE",
	"CLAUDE_CONVERSATION_LOST",
	"CLAUDE_LAUNCH_UNCONFIRMED",
	"CLAUDE_GENERATION_FAILED",
]);
export type SessionObserverErrorCode = z.infer<typeof SessionObserverErrorCodeSchema>;

export const SessionObserverErrorSchema = z.strictObject({
	code: SessionObserverErrorCodeSchema,
	message: z.string().refine((message) => message.trim().length > 0, "Describe the observer error."),
});
export type SessionObserverError = z.infer<typeof SessionObserverErrorSchema>;

export const SessionObserverSchema = z.strictObject({
	runId: UlidSchema,
	enabled: z.boolean(),
	observerId: UlidSchema.nullable(),
	observerRunId: UlidSchema.nullable(),
	harnessPreset: z.literal(SESSION_OBSERVER_HARNESS_PRESET).nullable(),
	accountId: UlidSchema.nullable(),
	modelId: z.string().nullable(),
	providerSessionId: z.string().nullable(),
	activityThreshold: z.number().int().positive(),
	generationState: SessionObserverGenerationStateSchema,
	generation: z.number().int().nonnegative(),
	lastConsumedCursor: z.string().nullable(),
	lastAttemptedCursor: z.string().nullable(),
	error: SessionObserverErrorSchema.nullable(),
});
export type SessionObserver = z.infer<typeof SessionObserverSchema>;

export const SessionObserverHistorySchema = z.strictObject({
	runId: UlidSchema,
	observerId: UlidSchema.nullable(),
	messages: z.array(SessionObserverMessageSchema),
});
export type SessionObserverHistory = z.infer<typeof SessionObserverHistorySchema>;

export const SessionObserverMessageInputSchema = SessionObserverMessageSchema.pick({ role: true, body: true });
export type SessionObserverMessageInput = z.infer<typeof SessionObserverMessageInputSchema>;

export const SessionObserverUpdateInputSchema = z.strictObject({
	body: z.string().refine((body) => body.trim().length > 0, "Write a status update."),
	embeds: z.array(SessionUpdateEmbedSchema).optional(),
});
export type SessionObserverUpdateInput = z.infer<typeof SessionObserverUpdateInputSchema>;

export const SessionObserverGetInputSchema = z.strictObject({ sessionId: SessionRefSchema });
export type SessionObserverGetInput = z.infer<typeof SessionObserverGetInputSchema>;

export const SessionObserverHistoryInputSchema = SessionObserverGetInputSchema;
export type SessionObserverHistoryInput = z.infer<typeof SessionObserverHistoryInputSchema>;

export const SessionObserverSetEnabledInputSchema = SessionObserverGetInputSchema.extend({
	enabled: z.boolean(),
	activityThreshold: z.number().int().positive().optional(),
});
export type SessionObserverSetEnabledInput = z.infer<typeof SessionObserverSetEnabledInputSchema>;
