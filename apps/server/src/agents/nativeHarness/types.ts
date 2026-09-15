export interface HarnessSnapshot {
	state: "ready" | "working" | "idle" | "failed" | "unknown";
	sessionId: string | null;
	acknowledgedMessageIds: string[];
	result: string | null;
	resultId?: string | null;
	error: string | null;
}
