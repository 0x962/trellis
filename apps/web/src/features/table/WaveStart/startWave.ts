import type { AgentRun, TicketSummary } from "@trellis/api";

// The assigned agent runs after the server accepted one more. The table reads
// `agentRuns.list { assigned: true }`, and this is the list the Start wave
// dialog writes back into that query. The new run goes first, and a run with
// the same id is dropped, so a second click on Start replaces the run it
// already holds instead of listing it twice.
export const startedRunList = (current: readonly AgentRun[] | undefined, run: AgentRun): AgentRun[] => [
	run,
	...(current ?? []).filter((item) => item.id !== run.id),
];

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
