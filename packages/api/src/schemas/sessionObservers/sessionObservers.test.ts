import { expect, test } from "bun:test";
import {
	SessionObserverHistorySchema,
	SessionObserverSchema,
	SessionObserverSetEnabledInputSchema,
} from "./sessionObservers.ts";

test("accepts a disabled observer before its first enablement", () => {
	expect(
		SessionObserverSchema.parse({
			runId: "01M3NVQ8K3ZBWDFDZ406A4M1D9",
			enabled: false,
			observerId: null,
			observerRunId: null,
			harnessPreset: null,
			accountId: null,
			modelId: null,
			providerSessionId: null,
			activityThreshold: 20,
			generationState: "idle",
			generation: 0,
			lastConsumedCursor: null,
			lastAttemptedCursor: null,
			error: null,
		}),
	).toMatchObject({ enabled: false, generation: 0 });
});

test("accepts ordered observer messages and a readable error", () => {
	const observerId = "01M3NVQ8K3ZBWDFDZ406A4M1DA";
	const parsed = SessionObserverSchema.parse({
		runId: "01M3NVQ8K3ZBWDFDZ406A4M1D9",
		enabled: true,
		observerId,
		observerRunId: "01M3NVQ8K3ZBWDFDZ406A4M1DB",
		harnessPreset: "claude",
		accountId: "01M3NVQ8K3ZBWDFDZ406A4M1DD",
		modelId: "anthropic/claude-sonnet-5.5",
		providerSessionId: "claude-conversation",
		activityThreshold: 20,
		generationState: "idle",
		generation: 1,
		lastConsumedCursor: "opaque-cursor",
		lastAttemptedCursor: "failed-cursor",
		error: {
			code: "CLAUDE_GENERATION_FAILED",
			message: "The Claude observer did not return a reply.",
		},
	});
	expect(parsed.error?.message).toBe("The Claude observer did not return a reply.");
	const history = SessionObserverHistorySchema.parse({
		runId: parsed.runId,
		observerId,
		messages: [
			{
				id: "01M3NVQ8K3ZBWDFDZ406A4M1DC",
				observerId,
				generation: 1,
				position: 0,
				role: "assistant",
				body: "The source checks pass.",
				createdAt: "2026-09-29T16:00:00.000Z",
			},
		],
	});
	expect(history.messages[0]?.body).toBe("The source checks pass.");
});

test("accepts a configurable threshold and rejects invalid values", () => {
	expect(
		SessionObserverSetEnabledInputSchema.parse({ sessionId: "Observed session", enabled: true, activityThreshold: 12 }),
	).toEqual({ sessionId: "Observed session", enabled: true, activityThreshold: 12 });
	expect(
		SessionObserverSetEnabledInputSchema.safeParse({
			sessionId: "Observed session",
			enabled: true,
			activityThreshold: 0,
		}).success,
	).toBe(false);
});
