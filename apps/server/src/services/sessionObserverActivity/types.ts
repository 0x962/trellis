import type {
	RuntimeHarnessActivityContext,
	RuntimeHarnessActivityItem,
	RuntimeHarnessActivitySignal,
} from "@trellis/runtime-protocol";

export type SessionObserverActivityCursor = string;

type AttemptIdentity = {
	attemptId: string;
	attemptGeneration: number;
};

export type SessionObserverActivityItem = RuntimeHarnessActivityItem & AttemptIdentity;
export type SessionObserverActivityContext = RuntimeHarnessActivityContext & AttemptIdentity;

export type SessionObserverActivitySignal =
	| (RuntimeHarnessActivitySignal & AttemptIdentity)
	| (AttemptIdentity & {
			id: string;
			kind: "unavailable";
			at: string;
			reason: "activity-unavailable";
	  });

export type SessionObserverActivityRead = {
	cursor: SessionObserverActivityCursor;
	items: SessionObserverActivityItem[];
	context: SessionObserverActivityContext[];
	signals: SessionObserverActivitySignal[];
};
