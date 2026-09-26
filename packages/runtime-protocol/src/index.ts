export const RUNTIME_PROTOCOL_VERSION = 13;
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
	message?: { text: string; at?: string };
	sessionId?: string;
	model?: string;
	prompt?: string;
	result?: string;
	tool?: HarnessTool;
	error?: string;
	tokenUsage?: RecordedTokenUsage;
};

export type RuntimeStream = "stdout" | "stderr" | "events";
export interface RuntimeHarnessObservation {
	observedAt: string;
	event: HarnessEvent;
}
export interface RuntimeAgentMetadata {
	attention?: HarnessAttention;
	sessionId: string | null;
	model: string | null;
	turnId: string | null;
	tool: HarnessTool | null;
	lastTool:
		| (HarnessTool & {
				startedAt: string | null;
				updatedAt: string;
				status: "running" | "completed" | "failed";
				error: string | null;
		  })
		| null;
	lastMessage: { text: string; at: string } | null;
	tokenUsage?: RecordedTokenUsage | null;
	error: string | null;
	outcome: NonNullable<HarnessEvent["outcome"]> | null;
}
export type SessionMode = "pty" | "stdio";
export type SessionStatus = "running" | "exited" | "unknown";
export interface LaunchSpec {
	id: string;
	command: string;
	args: string[];
	cwd: string;
	env?: Record<string, string>;
	mode: SessionMode;
	separateStderr?: boolean;
	timeoutMs?: number;
	cols?: number;
	rows?: number;
}
export interface RuntimeSession {
	stopReason?: "idle";
	id: string;
	daemonId: string;
	pid: number | null;
	mode: SessionMode;
	status: SessionStatus;
	startedAt: string;
	endedAt: string | null;
	exitCode: number | null;
	error: string | null;
}
export interface RuntimeProcessMetadata {
	pid: number;
	parentPid: number;
	groupId: number;
	identity: string;
	startedAt: string;
	executable: string;
}
export interface RuntimeListInput {
	ids?: string[];
	status?: SessionStatus;
	activity?: "ready" | "working" | "idle";
	hasError?: boolean;
	// The most sessions the answer holds. `listLimit` states the number a
	// caller gets when it names none.
	limit?: number;
}
// The most sessions a read returns when the caller names no `ids` and no
// `limit`. A machine runs tens of agent processes at once, so a caller that
// wants the live ones never needs more than this.
export const DEFAULT_LIST_LIMIT = 200;
// A caller that names the session ids it wants gets every one of them: the
// list of ids is already the bound. Every other caller gets DEFAULT_LIST_LIMIT.
export const listLimit = (input: RuntimeListInput): number =>
	input.limit ?? (input.ids === undefined ? DEFAULT_LIST_LIMIT : input.ids.length);
export interface RuntimeListPageInput extends RuntimeListInput {
	cursor?: string;
}
export interface RuntimeListPage {
	sessions: RuntimeProcessStatus[];
	nextCursor: string | null;
}
// The answer to a whole list read. The runtime hands back one page at a
// time, and `complete` is false when a page did not answer inside its
// deadline: the sessions are the pages that did answer, and the caller
// cannot read a missing session as a session the runtime does not hold.
export interface RuntimeSessionList {
	sessions: RuntimeProcessStatus[];
	complete: boolean;
}
export interface RuntimeProcessStatus extends RuntimeSession {
	elapsedMs: number | null;
	agent: RuntimeAgentMetadata | null;
	result: { id: string; text: string } | null;
	acknowledgedMessageIds: string[];
	activity: {
		state: "ready" | "working" | "idle";
		updatedAt: string;
		// The start of continuous work. Tool and message events preserve this time.
		workingSince?: string;
	} | null;
	checkedAt: string;
	controllable: boolean;
	process: RuntimeProcessMetadata | null;
	launch: Pick<LaunchSpec, "command" | "args" | "cwd"> | null;
}
export interface RuntimeHello {
	version: typeof RUNTIME_PROTOCOL_VERSION;
	daemonId: string;
	pid: number;
	startedAt: string;
	socketPath: string;
	capabilities?: string[];
}
export interface RuntimeOutput {
	data: string;
	startOffset: number;
	nextOffset: number;
	truncated: boolean;
}
export type RuntimeOutputEvent =
	| ({ type: "output" } & RuntimeOutput)
	| { type: "session"; session: RuntimeProcessStatus };

export type RuntimeTerminalEvent =
	| ({ type: "output"; data: Uint8Array } & Omit<RuntimeOutput, "data">)
	| { type: "session"; session: RuntimeProcessStatus };

export interface RuntimeDelivery {
	messageId: string;
	status: "written" | "unknown";
}
export interface RuntimeExpectedTurn {
	turnId: string | null;
	activityAt: string;
	idleBefore?: string;
}
export interface RuntimeNativeDelivery {
	messageId: string;
	claimed: boolean;
	status: "unknown" | "acknowledged";
}
// The answer to "did this message reach this session?". `delivered` is true
// when the session wrote the bytes or the agent confirmed the message.
// `registered` is true after the runtime accepts the message, before the agent confirms it.
// Send the same `messageId` to a new session only when the old session has
// `status: "exited"` and `registered` is false.
// `status` is the status of the session that holds the answer, so a caller
// tells a message that is still on its way from a message that can never
// arrive. A session the runtime has no record of produces no answer: the
// call fails with SESSION_NOT_FOUND.
export interface RuntimeMessageState {
	messageId: string;
	registered: boolean;
	delivered: boolean;
	status: SessionStatus;
}
export interface RuntimeMethods {
	terminal: {
		params: { id: string; offset: number };
		result: RuntimeTerminalEvent;
	};
	registerNativeDelivery: {
		params: {
			id: string;
			token: string;
			messageId: string;
			promptDigest: string;
			expected?: RuntimeExpectedTurn;
		};
		result: RuntimeNativeDelivery;
	};
	observe: {
		params: { id: string; token: string; event: HarnessEvent; expected?: RuntimeExpectedTurn };
		result: RuntimeProcessStatus;
	};
	turn: {
		params: {
			id: string;
			token: string;
			event: "SessionStart" | "UserPromptSubmit" | "Stop";
			messageId?: string;
			result?: string;
		};
		result: RuntimeProcessStatus;
	};
	inspect: { params: { id: string }; result: RuntimeProcessStatus };
	hasMessage: { params: { id: string; messageId: string }; result: RuntimeMessageState };
	subscribe: {
		params: { id: string; offset: number; stream?: RuntimeStream; output?: boolean };
		result: RuntimeOutputEvent;
	};
	shutdown: { params: Record<string, never>; result: null };
	deliver: {
		params: { id: string; messageId: string; data: string; expected?: RuntimeExpectedTurn };
		result: RuntimeDelivery;
	};
	hello: { params: Record<string, never>; result: RuntimeHello };
	list: { params: RuntimeListInput; result: RuntimeProcessStatus[] };
	listPage: { params: RuntimeListPageInput; result: RuntimeListPage };
	start: { params: LaunchSpec; result: RuntimeSession };
	input: { params: { id: string; data: string; userInput?: boolean; expected?: RuntimeExpectedTurn }; result: null };
	resize: { params: { id: string; cols: number; rows: number }; result: null };
	stop: { params: { id: string }; result: RuntimeSession };
	output: { params: { id: string; offset: number; stream?: RuntimeStream }; result: RuntimeOutput };
}
export type RuntimeMethod = keyof RuntimeMethods;
export interface RuntimeRequest {
	id: string;
	version: number;
	method: RuntimeMethod;
	params: RuntimeMethods[RuntimeMethod]["params"];
}
export type RuntimeResponse =
	| { id: string; result: unknown }
	| { id: string; error: { code: string; message: string } };
