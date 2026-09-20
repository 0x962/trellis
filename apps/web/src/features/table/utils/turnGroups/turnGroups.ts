import { type TicketSummary, type Turn, turnOf } from "@trellis/api";

// The ids of the tickets whose assigned agent run works right now.
// `turnOf` reads it: while the run of a ticket works, the agent holds the
// ticket, whatever its pull requests say.
export type WorkingTicketIds = ReadonlySet<string>;

// What the header of one turn group prints, and where the group sits.
export type TurnGroupMark = {
	// The group key: the turn with a dash for each space. The Done group
	// takes the key `done`, the same key the Done status group takes, so a
	// person who collapses one collapses both.
	key: string;
	label: string;
	// The place of the group in the table. A lower rank comes first.
	rank: number;
};

// The groups in display order. The rows the person moves come first: the
// pull requests he reviews, then the tickets he can start. Then the rows
// somebody else moves: an agent, then GitHub. Then the rows that wait on a
// question or on a merge. The finished rows come last.
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

// Whose turn a ticket row is. `working` is empty on a table that does not
// read the agent runs; a ticket whose run works then reads as the turn its
// status and its pull requests give it.
export const rowTurn = (row: TicketSummary, working: WorkingTicketIds = noWorking): Turn =>
	turnOf(row, working.has(row.id));

// The group a row falls into under the Turn grouping. `groupRows` drops a
// group that no row falls into, so an empty group never renders.
export const turnGroupMark = (row: TicketSummary, working?: WorkingTicketIds): TurnGroupMark => {
	const turn = rowTurn(row, working);
	return { key: turn.replaceAll(" ", "-"), label: labels[turn], rank: order.indexOf(turn) };
};

// The rows of a set whose turn is the person.
export const forYouCount = (rows: readonly TicketSummary[], working?: WorkingTicketIds): number =>
	rows.filter((row) => rowTurn(row, working) === "you").length;

// The count slot of a wave group header: the done and total counts of the
// wave, then the rows of the wave that wait for the person, `0/6 · 1 for
// you`. The epic band counts the current wave the same way, so the two
// numbers agree.
export const waveCountLabel = (counts: string, forYou: number): string =>
	forYou === 0 ? counts : `${counts} · ${forYou} for you`;
