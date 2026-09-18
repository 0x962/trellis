import type { AgentRun } from "@trellis/api";

export const isHistoricalSession = (run: Pick<AgentRun, "assigned" | "ticketStatusCategory">) =>
	!run.assigned || run.ticketStatusCategory === "done" || run.ticketStatusCategory === "canceled";
