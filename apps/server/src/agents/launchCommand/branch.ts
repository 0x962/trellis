import type { AgentRun } from "@trellis/api";
export const runBranch = (run: AgentRun) =>
	`trellis/${run.ticketIdentifier?.toLowerCase() ?? "manager"}-${run.id.toLowerCase()}`;
