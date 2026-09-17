export type StepState =
	| "pending"
	| "ready"
	| "running"
	| "waiting_human"
	| "unknown"
	| "succeeded"
	| "skipped"
	| "failed"
	| "canceled";
export interface FlowStep {
	key: string;
	nodeId: string;
	parentKey: string | null;
	iteration: number;
	round: number;
	state: StepState;
	phase: "step" | "children" | "condition";
	output: string | null;
	decision: "yes" | "no" | null;
	error: string | null;
	startedAt: number | null;
	deadlineAt: number | null;
	needsStop: boolean;
}
export interface FlowExecution {
	version: 1;
	flowId: string;
	flowVersion: number;
	status: "running" | "waiting" | "succeeded" | "failed" | "canceled";
	startedAt: number;
	updatedAt: number;
	error: string | null;
	steps: FlowStep[];
}
export type FlowEvent =
	| { type: "started"; key: string }
	| { type: "complete"; key: string; output: string; decision?: "yes" | "no" }
	| { type: "human"; key: string; approved: boolean; output: string }
	| { type: "unknown" | "fail"; key: string; error: string }
	| { type: "stopped"; key: string }
	| { type: "cancel"; reason: string }
	| { type: "tick" };
export interface FlowInput {
	key: string;
	nodeId: string;
	output: string;
}
export interface FlowAction {
	type: "agent" | "human" | "cancel";
	key: string;
	nodeId: string;
	purpose: "step" | "gate" | "loop-condition";
	instruction: string;
	inputs: FlowInput[];
}
