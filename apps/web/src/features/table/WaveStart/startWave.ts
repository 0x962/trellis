import type { AgentRun, AgentRunListOutput, TicketSummary } from "@trellis/api";

export const startedRunList = (current: AgentRunListOutput | undefined, run: AgentRun): AgentRunListOutput => ({
	items: [run, ...(current?.items ?? []).filter((item) => item.id !== run.id)],
	nextCursor: current?.nextCursor ?? null,
});

export type WaveStartHandlers = {
	// Asks the server to start one agent on the ticket. It answers with the
	// run in the state `starting`, before the harness process exists.
	start: (ticket: TicketSummary) => Promise<AgentRun>;
	// Puts one accepted run on its ticket row.
	showRun: (run: AgentRun) => void;
	// The result of one ticket: null when the server accepted the start, or
	// the error text when it refused.
	report: (ticketId: string, error: string | null) => void;
};

// Starts one agent on every ticket of the list, and answers true when every
// server call succeeded.
//
// The calls go out together, and each one reports on its own. A wave of five
// tickets no longer waits for its slowest call before the first four reach
// the table, and a ticket whose start failed carries its own error text.
export const startWave = async (
	targets: readonly TicketSummary[],
	{ start, showRun, report }: WaveStartHandlers,
): Promise<boolean> => {
	const failures = await Promise.all(
		targets.map(async (ticket) => {
			try {
				const run = await start(ticket);
				showRun(run);
				report(ticket.id, null);
				return false;
			} catch (error) {
				report(ticket.id, (error as Error).message);
				return true;
			}
		}),
	);
	return !failures.some(Boolean);
};
