import type { ReactNode } from "react";

export type FlowRunKind = "agent" | "gate" | "human" | "group" | "loop";

// The states of a flow step, plus `not_started` for a step of the saved
// graph that the run has not reached. A run creates the steps of a box when
// the box starts, so a step of an unstarted box has no state of its own.
export type FlowRunState =
	| "not_started"
	| "pending"
	| "ready"
	| "running"
	| "waiting_human"
	| "unknown"
	| "succeeded"
	| "skipped"
	| "failed"
	| "canceled";

export type FlowRunRow = {
	key: string;
	// The key of the row this row sits under. Collapsing that row hides this one.
	parentKey: string | null;
	// 0 for a row outside every box.
	depth: number;
	kind: FlowRunKind;
	title: string;
	state: FlowRunState;
	// A short fact beside the title: "3 at the same time", "12 min limit",
	// "round 2 of 5", "Yes", "Approved".
	meta: string | null;
	// Unix milliseconds. A row that never started has no start.
	startedAt: number | null;
	endedAt: number | null;
	// The moment a running box reaches its time limit.
	deadlineAt: number | null;
	output: string | null;
	error: string | null;
	// The row has a terminal to open.
	terminal: boolean;
	// The row waits for a person.
	decidable: boolean;
	hasChildren: boolean;
	// The avatar of the agent that works this row.
	actor?: ReactNode;
};
