export type HarnessState = "ready" | "working" | "idle" | "needs_input" | "failed" | "unknown";
export interface HarnessPermission {
	requestId: string;
	toolName: string;
	toolUseId: string | null;
	input: Record<string, unknown>;
}
export interface HarnessTranscriptMessage {
	role: "user" | "assistant";
	text: string;
	messageId?: string;
}
export interface HarnessSnapshot {
	transcript: HarnessTranscriptMessage[];
	state: HarnessState;
	sessionId: string;
	acknowledgedMessageIds: string[];
	pendingPermissions: HarnessPermission[];
	result: string | null;
	error: string | null;
}
export type HarnessEvent =
	| { type: "ready" }
	| { type: "acknowledged"; messageId: string }
	| { type: "permission"; permission: HarnessPermission }
	| { type: "result"; state: HarnessState; result: string | null }
	| { type: "unknown"; error: string };
