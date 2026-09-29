import type { SessionObserverCandidate } from "../sessionObservers";
import type { SessionObserverTrigger } from "./sessionObserverPrompt.ts";

export type SessionObserverGenerationCandidate = Pick<
	SessionObserverCandidate,
	"runId" | "lastConsumedCursor" | "hasObserverMessages" | "activityThreshold"
>;

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
	if (!candidate.hasObserverMessages) return "initial";
	if (activity.itemCount >= candidate.activityThreshold) return "threshold";
	return null;
};
