import type { AgentRun } from "@trellis/api";
export const runBranch = (run: Pick<AgentRun, "ticketIdentifier" | "id" | "kind">) =>
	`trellis/${run.ticketIdentifier?.toLowerCase() ?? run.kind}-${run.id.toLowerCase()}`;
