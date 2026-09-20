import { type TicketSummary, type Turn, turnOf } from "@trellis/api";

// The ids of the tickets whose assigned agent run works right now.
// `turnOf` reads it: while the run of a ticket works, the agent holds the
// ticket, whatever its pull requests say.
export type WorkingTicketIds = ReadonlySet<string>;

export type TurnBucket = {
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
// a question or on a merge. The finished rows come last.
const order: readonly Turn[] = ["you", "ready", "agent", "github", "waits on your answer", "waits on a merge", "done"];

const labels: Record<Turn, string> = {
	you: "Your turn",
	ready: "Ready to start",
	agent: "With an agent",
	github: "With GitHub",
	"waits on your answer": "Waits on your answer",
	"waits on a merge": "Waits on a merge",
	done: "Done",
};

const noWorking: WorkingTicketIds = new Set();

// An empty `working` gives a ticket whose agent run works the turn that its
// status and its pull requests alone give it.
export const rowTurn = (row: TicketSummary, working: WorkingTicketIds = noWorking): Turn =>
	turnOf(row, working.has(row.id));

// The bucket a row falls into under the Turn grouping. `groupRows` drops a
// bucket that no row falls into, so an empty group never renders.
export const turnBucketOf = (row: TicketSummary, working?: WorkingTicketIds): TurnBucket => {
	const turn = rowTurn(row, working);
	return { key: turn.replaceAll(" ", "-"), label: labels[turn], rank: order.indexOf(turn) };
};

export const forYouCount = (rows: readonly TicketSummary[], working?: WorkingTicketIds): number =>
	rows.filter((row) => rowTurn(row, working) === "you").length;
