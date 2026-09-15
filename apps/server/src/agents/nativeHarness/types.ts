export interface HarnessSnapshot {
	state: "ready" | "working" | "idle" | "failed" | "unknown";
	sessionId: string;
	acknowledgedMessageIds: string[];
	result: string | null;
	resultId?: string | null;
	error: string | null;
}
