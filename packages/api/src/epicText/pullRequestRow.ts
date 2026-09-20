import type { TicketPr } from "../schemas/ticketPr.ts";
import { turnOf } from "../turn/turn.ts";
import { factSeparator, groupSeparator } from "./separators.ts";

// One pull request of a ticket, in the words the epic page prints under the
// ticket row. `apps/web/src/features/table/PrRow/prRowText/prRowText.ts`
// builds the same facts for the page, and a new fact must reach both sides.
//
// The page names the agent that works on a pull request. `epics.get` answers
// with no run, so `turnOf` reads false for a working run here and the turn
// of such a pull request is the word `agent`.

// A count and the noun it counts: "6 files", "1 file".
const countWord = (count: number, singular: string, plural: string): string =>
	`${count} ${count === 1 ? singular : plural}`;

// GitHub marks a pull request as a draft only while it is open, so a merged
// pull request that was once a draft reads as merged here too.
const stateWord = (pr: TicketPr): string => (pr.state === "open" && pr.isDraft ? "draft" : pr.state);

// `stackedOn` holds the pull request whose head branch is the base branch of
// this one, so this one merges after that one.
const stateFacts = (pr: TicketPr): string[] =>
	pr.stackedOn === null ? [stateWord(pr)] : [stateWord(pr), `stacked on #${pr.stackedOn.number}`];

// GitHub leaves `additions`, `deletions` and `changedFiles` null until it
// measures the pull request, and counts 0 for a pull request that changes no
// line. Each missing or zero count drops its fact.
const sizeFacts = (pr: TicketPr): string[] => {
	const facts: string[] = [];
	if (pr.additions !== null && pr.deletions !== null && (pr.additions > 0 || pr.deletions > 0))
		facts.push(`+${pr.additions} −${pr.deletions}`);
	if (pr.changedFiles !== null && pr.changedFiles > 0) facts.push(countWord(pr.changedFiles, "file", "files"));
	return facts;
};

// The check counts in the order the review page prints them. An outcome that
// counts zero drops its fact.
const checkOutcomes: ReadonlyArray<{ word: string; count: (pr: TicketPr) => number }> = [
	{ word: "failed", count: (pr) => pr.fail },
	{ word: "pending", count: (pr) => pr.pending },
	{ word: "passed", count: (pr) => pr.pass },
	{ word: "skipped", count: (pr) => pr.skipped },
];

const checkFacts = (pr: TicketPr): string[] =>
	checkOutcomes.filter((outcome) => outcome.count(pr) > 0).map((outcome) => `${outcome.count(pr)} ${outcome.word}`);

const threadFacts = (pr: TicketPr): string[] =>
	pr.openThreads === 0 ? [] : [countWord(pr.openThreads, "thread", "threads")];

// `succeeded` reads `passed`, the word the check counts already use for the
// same outcome.
const flowWords: Record<TicketPr["flowRuns"][number]["status"], string> = {
	running: "running",
	waiting: "waiting",
	succeeded: "passed",
	failed: "failed",
	canceled: "canceled",
};

// `flowRuns` arrives newest first.
const flowFacts = (pr: TicketPr): string[] => {
	const newest = pr.flowRuns[0];
	return newest === undefined ? [] : [`flow: ${flowWords[newest.status]}`];
};

// Who acts next on the pull request. A merged or closed pull request leaves
// nobody to act, so it prints no turn.
const turnFacts = (pr: TicketPr): string[] => {
	const turn = turnOf(pr, false);
	return turn === "done" ? [] : [turn];
};

const factGroups: ReadonlyArray<(pr: TicketPr) => string[]> = [
	stateFacts,
	sizeFacts,
	checkFacts,
	threadFacts,
	flowFacts,
	turnFacts,
];

export const pullRequestRowLine = (pr: TicketPr): string =>
	`#${pr.number}${groupSeparator}${factGroups.flatMap((factsOf) => factsOf(pr)).join(factSeparator)}`;
