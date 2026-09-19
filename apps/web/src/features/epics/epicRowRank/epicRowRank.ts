import type { AgentRun, TicketSummary } from "@trellis/api";

// The ids of the tickets that hold an assigned agent run. The input is the
// result of `agentRuns.list { assigned: true }`, the query that
// `useAssignedRun` and `useWorkingAgents` read. The run kind is `agent`, the
// kind the actor cell of a row shows.
export const assignedTicketIds = (runs: readonly Pick<AgentRun, "kind" | "ticketId">[]): ReadonlySet<string> =>
	new Set(runs.filter((run) => run.kind === "agent" && run.ticketId !== null).map((run) => run.ticketId!));

// The rank of a ticket inside a milestone group of the epic page, by what
// the person does next. A lower rank comes first:
// 0, the ticket waits for the person: its status names the human reviewer.
// 1, the ticket can start: the todo category with no assigned agent run.
// 2, an agent runs the ticket: it holds an assigned agent run.
// 3, every other open ticket.
// 4, a Done or Canceled ticket.
export const epicRowRank = (assigned: ReadonlySet<string>) => (ticket: TicketSummary) => {
	const { category, reviewer } = ticket.status;
	if (category === "done" || category === "canceled") return 4;
	if (reviewer === "human") return 0;
	if (assigned.has(ticket.id)) return 2;
	return category === "todo" ? 1 : 3;
};
