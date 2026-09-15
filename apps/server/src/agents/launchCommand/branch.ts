import type { AgentRun } from "@trellis/api";
export const runBranch = (run: Pick<AgentRun, "ticketIdentifier" | "id">) =>
	`trellis/${run.ticketIdentifier?.toLowerCase() ?? "manager"}-${run.id.toLowerCase()}`;
