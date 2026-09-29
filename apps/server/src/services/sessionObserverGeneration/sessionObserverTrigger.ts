import type { SessionObserverTrigger } from "./sessionObserverPrompt.ts";

export type SessionObserverGenerationCandidate = {
	runId: string;
	lastConsumedCursor: string | null;
	hasInitialUpdate: boolean;
	activityThreshold: number;
};

export type SessionObserverActivityState = {
	itemCount: number;
	completed: boolean;
	needsInput: boolean;
	unavailable: boolean;
};

export const sessionObserverTrigger = (
	candidate: SessionObserverGenerationCandidate,
	activity: SessionObserverActivityState,
): SessionObserverTrigger | null => {
	if (activity.needsInput) return "needs-input";
	if (activity.completed) return "completed";
	if (!candidate.hasInitialUpdate) return "initial";
	if (!activity.unavailable && activity.itemCount >= candidate.activityThreshold) return "threshold";
	return null;
};
