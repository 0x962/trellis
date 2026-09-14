import type { RequestContext } from "../../context.ts";

export type ControllerCtx = Pick<RequestContext, "now">;
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
	events: ControllerEvent[];
	dueAt: string;
	error: string | null;
};
