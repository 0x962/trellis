import { type TicketPr, turnOf } from "@trellis/api";
import { formatCount } from "../../../../lib/format";

export type PrRowTone = "fg" | "muted" | "danger";

// One cell of a pull request row. `key` stays the same for one cell across
// renders, and the tests find a cell by it.
type PrRowCell = { key: string; text: string; tone: PrRowTone };

type FlowStatus = TicketPr["flowRuns"][number]["status"];

const mutedCell = (key: string, text: string): PrRowCell => ({ key, text, tone: "muted" });

const countWord = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

// GitHub marks a pull request as a draft only while it is open, so a merged
// pull request that was once a draft reads as merged here too.
const stateWord = (pr: TicketPr) => (pr.state === "open" && pr.isDraft ? "draft" : pr.state);

// `stackedOn` holds the pull request whose head branch is the base branch of
// this one, so this one merges after that one.
const stateCells = (pr: TicketPr): PrRowCell[] => {
	const cells = [mutedCell("state", stateWord(pr))];
	if (pr.stackedOn !== null) cells.push(mutedCell("stack", `stacked on #${pr.stackedOn.number}`));
	return cells;
};

// GitHub sets `additions` and `deletions` to null until it measures the pull
// request. `changedFiles` counts 0 for a pull request that changes no file,
// and that cell drops out.
const sizeCells = (pr: TicketPr): PrRowCell[] => {
	const cells: PrRowCell[] = [];
	if (pr.additions !== null && pr.deletions !== null)
		cells.push(mutedCell("size", `+${formatCount(pr.additions)} −${formatCount(pr.deletions)}`));
	if (pr.changedFiles !== null && pr.changedFiles > 0)
		cells.push(mutedCell("files", countWord(pr.changedFiles, "file", "files")));
	return cells;
};

// The check counts in the order the review page prints them.
const checkBuckets: ReadonlyArray<{ word: string; tone: PrRowTone; count: (pr: TicketPr) => number }> = [
	{ word: "failed", tone: "danger", count: (pr) => pr.fail },
	{ word: "pending", tone: "muted", count: (pr) => pr.pending },
	{ word: "passed", tone: "muted", count: (pr) => pr.pass },
	{ word: "skipped", tone: "muted", count: (pr) => pr.skipped },
];

const checkCells = (pr: TicketPr): PrRowCell[] =>
	checkBuckets
		.filter((bucket) => bucket.count(pr) > 0)
		.map((bucket) => ({ key: bucket.word, text: `${bucket.count(pr)} ${bucket.word}`, tone: bucket.tone }));

// The review threads that nobody resolved.
const threadCells = (pr: TicketPr): PrRowCell[] =>
	pr.openThreads === 0 ? [] : [mutedCell("threads", countWord(pr.openThreads, "thread", "threads"))];

// `succeeded` reads `passed`, the word the check counts already use for the
// same outcome.
const flowWords: Record<FlowStatus, string> = {
	running: "running",
	waiting: "waiting",
	succeeded: "passed",
	failed: "failed",
	canceled: "canceled",
};

// `flowRuns` arrives newest first.
const flowCells = (pr: TicketPr): PrRowCell[] => {
	const newest = pr.flowRuns[0];
	return newest === undefined ? [] : [mutedCell("flow", `flow: ${flowWords[newest.status]}`)];
};

// `turnOf` names who acts next. `you` takes the full foreground color,
// because the reader must do the work. `done` leaves nobody to act.
const turnCells = (pr: TicketPr): PrRowCell[] => {
	const hasWorkingRun = false;
	const turn = turnOf(pr, hasWorkingRun);
	return turn === "done" ? [] : [{ key: "turn", text: turn, tone: turn === "you" ? "fg" : "muted" }];
};

const cellGroups: ReadonlyArray<(pr: TicketPr) => PrRowCell[]> = [
	stateCells,
	sizeCells,
	checkCells,
	threadCells,
	flowCells,
	turnCells,
];

export const prRowCells = (pr: TicketPr): PrRowCell[] => cellGroups.flatMap((cellsOf) => cellsOf(pr));
