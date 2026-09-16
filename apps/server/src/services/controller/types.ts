import type { ManagerNextAction, ManagerWait } from "@trellis/api/contract";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { RequestContext } from "../../context.ts";

export type ControllerInput = { sessions: RuntimeProcessStatus[] };
export type ControllerCtx = Pick<RequestContext, "now">;
export type WorkOutcome = {
	ticketId: string | null;
	status: "assigned" | "queued" | "blocked" | "no_action";
	reference?: string;
	reason: string;
	waitFor?: ManagerWait;
};
// A ticket event names its ticket. A project event has a null `ticketId`
// and names in `project` the sub-project that gained or lost its own
// manager; the manager records its outcome under a null ticket.
export type ControllerEvent = {
	id: number;
	ticketId: string | null;
	action: string;
	actor: { name: string; kind: string };
	createdAt: string;
	project?: { id: string; path: string };
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
