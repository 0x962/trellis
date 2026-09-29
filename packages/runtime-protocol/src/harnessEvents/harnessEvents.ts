export type HarnessInputRequest = {
	id: string;
	kind: "question" | "permission" | "elicitation";
	title: string;
	blocking: boolean;
	questions?: Array<{
		id: string;
		question: string;
		options: Array<{ label: string; description?: string }>;
		multiple: boolean;
		minSelections?: number;
		maxSelections?: number;
	}>;
};
export type HarnessAttention = {
	sequence: number;
	completion: { sequence: number; at: string } | null;
	failure: { sequence: number; at: string } | null;
	requests: Array<HarnessInputRequest & { sequence: number; at: string }>;
};
export type RecordedTokenUsage = { totalTokens: number };
export type HarnessTool = {
	id: string;
	name: string;
	input?: unknown;
	output?: unknown;
};

export type HarnessEvent = {
	messageAvailability?: "unavailable";
	activityId?: string;
	willRetry?: boolean;
	turnId?: string;
	outcome?: "completed" | "interrupted" | "failed";
	kind:
		| "session"
		| "prompt"
		| "working"
		| "idle"
		| "message"
		| "tool-start"
		| "tool-update"
		| "tool-end"
		| "error"
		| "input-request"
		| "input-resolved";
	inputRequest?: HarnessInputRequest;
	requestId?: string;
	message?: { id?: string; text: string; at?: string; complete?: boolean };
	sessionId?: string;
	model?: string;
	prompt?: string;
	result?: string;
	resultActivityIds?: string[];
	tool?: HarnessTool;
	error?: string;
	tokenUsage?: RecordedTokenUsage;
};

export type RuntimeHarnessActivityItem =
	| {
			id: string;
			kind: "message";
			role: "user" | "assistant";
			text: string;
			at: string;
			turnId?: string;
	  }
	| {
			id: string;
			kind: "tool";
			tool: HarnessTool & { updates?: unknown[] };
			error?: string;
			at: string;
			turnId?: string;
	  };

export type RuntimeHarnessActivityContext = {
	id: string;
	kind: "message";
	role: "assistant";
	text: string;
	at: string;
	turnId?: string;
	completeness: "unproven";
};

export type RuntimeHarnessActivitySignal =
	| {
			id: string;
			kind: "input-request";
			request: HarnessInputRequest;
			at: string;
			turnId?: string;
	  }
	| {
			id: string;
			kind: "completion";
			outcome: "completed" | "interrupted" | "failed";
			messageAvailability: "complete" | "unavailable";
			at: string;
			turnId?: string;
	  };

export interface RuntimeHarnessObservation {
	observedAt: string;
	event: HarnessEvent;
	activityVersion?: 1;
	activity?: RuntimeHarnessActivityItem;
	context?: RuntimeHarnessActivityContext;
	signal?: RuntimeHarnessActivitySignal;
}
