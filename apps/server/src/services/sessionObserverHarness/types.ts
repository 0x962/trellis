export const SESSION_OBSERVER_MODEL = "anthropic/claude-sonnet-5.5";

export type SessionObserverReplyInput = {
	observerId: string;
	observerRunId: string;
	sourceRunId: string;
	claimId: string;
	throughCursor: string;
	deliveryId?: string;
	instruction: string;
	userContext: string;
	signal: AbortSignal;
};

export type SessionObserverUsage = {
	source: "claude-transcript";
	requests: Array<{
		messageId: string;
		requestId: string;
		uncachedInput: number;
		cachedInput: number;
		cacheWrite5m: number;
		cacheWrite1h: number;
		output: number;
		reasoningOutput: number;
	}>;
};

export type SessionObserverReply = {
	text: string;
	observerRunId: string;
	attemptId: string;
	providerSessionId: string;
	messageId: string;
	resultId: string;
	modelId: string;
	usage: SessionObserverUsage;
};

export type ObserverHarnessErrorCode =
	| "OBSERVER_DISABLED"
	| "OBSERVER_MODEL_UNAVAILABLE"
	| "OBSERVER_ACCOUNT_UNAVAILABLE"
	| "OBSERVER_CONVERSATION_LOST"
	| "OBSERVER_DELIVERY_UNKNOWN"
	| "OBSERVER_REPLY_INCOMPLETE"
	| "OBSERVER_REQUEST_CANCELED"
	| "OBSERVER_CANCEL_UNCONFIRMED"
	| "OBSERVER_USAGE_UNAVAILABLE"
	| "OBSERVER_CONTEXT_CAPACITY"
	| "OBSERVER_HARNESS_FAILED";

export class ObserverHarnessError extends Error {
	constructor(
		readonly code: ObserverHarnessErrorCode,
		message: string,
	) {
		super(message);
		this.name = "ObserverHarnessError";
	}
}
