import { expect, test } from "bun:test";
import { SessionObserverSchema, SessionObserverSetEnabledInputSchema } from "./sessionObservers.ts";

test("accepts a disabled observer before its first enablement", () => {
	expect(
		SessionObserverSchema.parse({
			runId: "01M3NVQ8K3ZBWDFDZ406A4M1D9",
			enabled: false,
			observerId: null,
			providerId: null,
			modelId: null,
			activityThreshold: 20,
			generationState: "idle",
			generation: 0,
			lastConsumedCursor: null,
			error: null,
			messages: [],
		}),
	).toMatchObject({ enabled: false, generation: 0, messages: [] });
});

test("accepts ordered observer messages and a readable error", () => {
	const observerId = "01M3NVQ8K3ZBWDFDZ406A4M1DA";
	const parsed = SessionObserverSchema.parse({
		runId: "01M3NVQ8K3ZBWDFDZ406A4M1D9",
		enabled: true,
		observerId,
		providerId: "01M3NVQ8K3ZBWDFDZ406A4M1DB",
		modelId: "anthropic/claude-sonnet-5.5",
		activityThreshold: 20,
		generationState: "idle",
		generation: 1,
		lastConsumedCursor: "opaque-cursor",
		error: "The provider did not return a reply.",
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
	expect(parsed.messages[0]?.body).toBe("The source checks pass.");
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
