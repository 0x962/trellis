import { isAgentWorking, type TicketSummary } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";

const QUERY_WORKERS = 8;

export async function workingTicketIds(
	client: TrellisClient,
	tickets: Pick<TicketSummary, "id">[],
): Promise<Set<string>> {
	const working = new Set<string>();
	const workers = Math.min(QUERY_WORKERS, tickets.length);
	await Promise.all(
		Array.from({ length: workers }, async (_, worker) => {
			for (let index = worker; index < tickets.length; index += workers) {
				const ticket = tickets[index]!;
				const runs = await client.agentRuns.list({ ticket: ticket.id, assigned: true });
				if (runs.some((run) => run.kind === "agent" && isAgentWorking(run))) working.add(ticket.id);
			}
		}),
	);
	return working;
}
