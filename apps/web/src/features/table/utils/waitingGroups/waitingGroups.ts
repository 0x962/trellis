import { type TicketSummary, type Waiting, waitingFor } from "@trellis/api";

// The ids of the tickets whose assigned agent run works right now.
// `waitingFor` reads it: while the run of a ticket works, the ticket waits
// for the agent, whatever its pull requests say.
export type WorkingTicketIds = ReadonlySet<string>;

export type WaitingBucket = {
	// The Done group takes the key `done`, the same key the Done status
	// group takes, so a person who collapses one collapses both.
	key: string;
	label: string;
	// The place of the group in the table. A lower rank comes first.
	rank: number;
};

// The groups in display order. The rows the person moves come first: the
// pull requests to review, then the tickets to start. Then the rows that an
// agent moves, then the rows that GitHub moves. Then the rows that wait on
// a merge. The finished rows come last.
const order: readonly Waiting[] = ["you", "ready", "agent", "github", "merge", "done"];

const labels: Record<Waiting, string> = {
	you: "Waits for you",
	ready: "Ready to start",
	agent: "With an agent",
	github: "With GitHub",
	merge: "Waits on a merge",
	done: "Done",
};

const noWorking: WorkingTicketIds = new Set();

// An empty `working` reads a ticket whose agent run works from its status and
// its pull requests alone.
export const rowWaiting = (row: TicketSummary, working: WorkingTicketIds = noWorking): Waiting =>
	waitingFor(row, working.has(row.id));

// The bucket a row falls into under the Waiting grouping. `groupRows` drops a
// bucket that no row falls into, so an empty group never renders.
export const waitingBucketOf = (row: TicketSummary, working?: WorkingTicketIds): WaitingBucket => {
	const waiting = rowWaiting(row, working);
	return { key: waiting, label: labels[waiting], rank: order.indexOf(waiting) };
};

export const forYouCount = (rows: readonly TicketSummary[], working?: WorkingTicketIds): number =>
	rows.filter((row) => rowWaiting(row, working) === "you").length;
