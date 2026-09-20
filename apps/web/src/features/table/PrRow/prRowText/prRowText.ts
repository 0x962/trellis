import { type TicketPr, turnOf } from "@trellis/api";

// The color of one cell. The row itself is muted, so a `muted` cell needs
// no color of its own.
export type PrRowTone = "fg" | "muted" | "danger";

// One cell of a pull request row. The row draws the cells in order and puts
// a dot between two of them. `key` names the cell and tells React apart.
export type PrRowCell = { key: string; text: string; tone: PrRowTone };

type FlowStatus = TicketPr["flowRuns"][number]["status"];

const muted = (key: string, text: string): PrRowCell => ({ key, text, tone: "muted" });

const countWord = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

// GitHub marks a pull request as a draft only while it is open, so a merged
// pull request that was once a draft reads as merged here too.
const stateWord = (pr: TicketPr) => (pr.state === "open" && pr.isDraft ? "draft" : pr.state);

// The state of the pull request, then the pull request it is stacked on.
// `stackedOn` holds the pull request whose head branch is the base branch
// of this one, so this one merges after that one.
const stateCells = (pr: TicketPr): PrRowCell[] => {
	const cells = [muted("state", stateWord(pr))];
	if (pr.stackedOn !== null) cells.push(muted("stack", `stacked on #${pr.stackedOn.number}`));
	return cells;
};

// The changed line counts, then the changed file count. GitHub sends the
// three counts together when it measures a pull request, and a pull request
// that it has not measured yet drops all three cells.
const sizeCells = (pr: TicketPr): PrRowCell[] => {
	const cells: PrRowCell[] = [];
	if (pr.additions !== null && pr.deletions !== null) cells.push(muted("size", `+${pr.additions} −${pr.deletions}`));
	if (pr.changedFiles !== null && pr.changedFiles > 0)
		cells.push(muted("files", countWord(pr.changedFiles, "file", "files")));
	return cells;
};

// The check counts in the order the review page prints them, each with the
// word that names it. A count of zero prints nothing, so a pull request with
// no failed check never prints `0 failed`.
const checkWords: ReadonlyArray<{ word: string; tone: PrRowTone; count: (pr: TicketPr) => number }> = [
	{ word: "failed", tone: "danger", count: (pr) => pr.fail },
	{ word: "pending", tone: "muted", count: (pr) => pr.pending },
	{ word: "passed", tone: "muted", count: (pr) => pr.pass },
	{ word: "skipped", tone: "muted", count: (pr) => pr.skipped },
];

const checkCells = (pr: TicketPr): PrRowCell[] =>
	checkWords
		.filter((check) => check.count(pr) > 0)
		.map((check) => ({ key: check.word, text: `${check.count(pr)} ${check.word}`, tone: check.tone }));

// The review threads that nobody resolved. A pull request with no open
// thread prints nothing.
const threadCells = (pr: TicketPr): PrRowCell[] =>
	pr.openThreads === 0 ? [] : [muted("threads", countWord(pr.openThreads, "thread", "threads"))];

// The word for each state of a flow execution. `succeeded` reads `passed`,
// the word the check counts already use for the same outcome.
const flowWords: Record<FlowStatus, string> = {
	running: "running",
	waiting: "waiting",
	succeeded: "passed",
	failed: "failed",
	canceled: "canceled",
};

// The newest flow execution of the ticket that holds this pull request.
// `flowRuns` arrives newest first. A ticket that ran no flow prints nothing.
const flowCells = (pr: TicketPr): PrRowCell[] => {
	const newest = pr.flowRuns[0];
	return newest === undefined ? [] : [muted("flow", `flow: ${flowWords[newest.status]}`)];
};

// Who acts next on the pull request. `you` takes the full foreground color,
// because it names work that the person who reads the row must do himself.
// A merged pull request and a closed pull request leave nobody to act, and
// the cell drops out.
const turnCells = (pr: TicketPr): PrRowCell[] => {
	const turn = turnOf(pr, false);
	return turn === "done" ? [] : [{ key: "turn", text: turn, tone: turn === "you" ? "fg" : "muted" }];
};

// The cells of the row in the order the row prints them. Each builder owns
// its cells and returns an empty list when the pull request carries no
// value for them.
const builders: ReadonlyArray<(pr: TicketPr) => PrRowCell[]> = [
	stateCells,
	sizeCells,
	checkCells,
	threadCells,
	flowCells,
	turnCells,
];

// Every cell of one pull request row, in order, with the empty cells gone.
export const prRowCells = (pr: TicketPr): PrRowCell[] => builders.flatMap((build) => build(pr));
