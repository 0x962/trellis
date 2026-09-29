import { isAgentWorking } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";

export async function workingTicketIds(client: TrellisClient, epic: string): Promise<Set<string>> {
	const working = new Set<string>();
	const runs = await client.agentRuns.latestByEpicTicket({ epic });
	for (const run of runs) if (run.ticketId !== null && isAgentWorking(run)) working.add(run.ticketId);
	return working;
}
