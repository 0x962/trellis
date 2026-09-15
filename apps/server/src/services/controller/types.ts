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
	state: "pending" | "sending" | "sent" | "unknown" | "cancelled";
	events: ControllerEvent[];
	dueAt: string;
	error: string | null;
	resolution?: {
		kind: "cancelled";
		receipt: "unknown";
		generation: number;
		reason: string;
		actor: { kind: "human"; name: string };
		at: string;
	} | null;
};
