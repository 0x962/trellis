import type { ManagerNextAction } from "@trellis/api/contract";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { RequestContext } from "../../context.ts";

export type ControllerInput = { sessions: RuntimeProcessStatus[] };
export type ControllerCtx = Pick<RequestContext, "now">;
export type WorkOutcome = {
	ticketId: string | null;
	status: "assigned" | "queued" | "blocked" | "no_action";
	reference?: string;
	reason: string;
};
export type ControllerEvent = {
	id: number;
	ticketId: string;
	action: string;
	actor: { name: string; kind: string };
	createdAt: string;
};
export type Dispatch = {
	id: string;
	projectId: string;
	runId: string | null;
	terminalId: string | null;
	sessionId: string | null;
	generation: number;
	state: "pending" | "sending" | "sent" | "unknown";
	workState: "untracked" | "open" | "handled";
	outcomes: WorkOutcome[];
	nextActions: ManagerNextAction[];
	handledAt: string | null;
	events: ControllerEvent[];
	dueAt: string;
	error: string | null;
};
