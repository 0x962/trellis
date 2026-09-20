import type { EpicCounts } from "../schemas/epicCounts.ts";
import type { MilestoneSummary } from "../schemas/milestone.ts";
import type { TicketSummary } from "../schemas/ticket.ts";
import type { TicketPr } from "../schemas/ticketPr.ts";
import { turnOf } from "../turn/turn.ts";

// The epic page in the words a terminal prints. The page has a bar, a color
// and a link for each of these facts; a terminal has none of them, so every
// fact here is a word or a number. Screen 1 of
// `docs/research/trellis-for-one-human-and-many-agents.md` holds the page
// these lines follow.
//
// A run name is a fact of the web page that a terminal cannot reach: the
// epic reply carries the tickets and their pull requests, and no run. So
// `turnOf` reads false for a working run, and the turn of a pull request
// whose agent still works on it reads `agent`.

// The separator between two facts of one line. The band of the page draws
// the same dot between its counts.
const dot = " · ";

// The separator between the parts of a heading. The page sets the parts of
// a group header apart by space.
const gap = "  ";

// A count and the noun it counts: "6 files", "1 file".
const countWord = (count: number, singular: string, plural: string): string =>
	`${count} ${count === 1 ? singular : plural}`;

// The done tickets over the tickets that count. A canceled ticket is never
// done and never in the total.
const doneOf = (counts: EpicCounts): string => `${counts.done} of ${counts.total - counts.canceled}`;

// The five buckets of the bar, in the order the bar stacks them. A bucket
// that counts zero keeps its word, so the reader sees "started 0".
const bandBuckets = ["done", "review", "started", "todo", "canceled"] as const;

// The band of the epic page: what the bar measures, then the legend that
// names each of its parts.
export const epicBandLine = (counts: EpicCounts): string =>
	[`${doneOf(counts)} done`, ...bandBuckets.map((bucket) => `${bucket} ${counts[bucket]}`)].join(dot);

// What the person can do in the wave the epic works in now. `toStart`
// counts the Todo tickets that no other ticket holds back. `waitsForYou`
// counts the tickets whose turn is the person.
export const epicCountLine = (wave: Pick<MilestoneSummary, "toStart" | "waitsForYou">): string =>
	[`${wave.toStart} to start`, `${wave.waitsForYou} ${wave.waitsForYou === 1 ? "waits" : "wait"} for you`].join(dot);

// The counts beside a wave name: the done tickets of the wave, and the
// tickets of the wave whose turn is the person. A wave that waits for
// nobody prints the done count alone.
const waveCounts = (wave: Pick<MilestoneSummary, "counts" | "waitsForYou">): string =>
	wave.waitsForYou === 0 ? doneOf(wave.counts) : `${doneOf(wave.counts)}${dot}${wave.waitsForYou} for you`;

// The header of one wave group. `current` is true for the first wave that
// is not done: the page marks it with a badge, and a terminal with the word.
export const epicWaveHeading = (
	wave: Pick<MilestoneSummary, "counts" | "name" | "ref" | "waitsForYou">,
	current: boolean,
): string => [`${wave.name} (${wave.ref})`, ...(current ? ["current"] : []), waveCounts(wave)].join(gap);

// The identifiers the waits cell prints before it counts the rest.
const shownWaits = 2;

// What holds a ticket back. The cell takes one of four forms: no text, for
// a ticket that waits for nothing and is not Todo; `ready`, for a Todo
// ticket that no other ticket holds back; the identifiers of the tickets it
// waits for, two at most and then `+n`; and an identifier with the word
// `asks` after it, for a ticket that only a person can finish. The page
// draws a yellow dot in place of that word, and a terminal has no color.
export const ticketWaitsText = (ticket: Pick<TicketSummary, "ready" | "waitsOn">): string => {
	if (ticket.waitsOn.length === 0) return ticket.ready ? "ready" : "";
	const shown = ticket.waitsOn
		.slice(0, shownWaits)
		.map((dependency) => (dependency.isQuestion ? `${dependency.identifier} asks` : dependency.identifier))
		.join(dot);
	const rest = ticket.waitsOn.length - shownWaits;
	return rest > 0 ? `${shown} +${rest}` : shown;
};

// How many tickets wait for this one. A ticket that releases nothing prints
// no text.
export const ticketReleasesText = (ticket: Pick<TicketSummary, "releases">): string =>
	ticket.releases.length === 0 ? "" : String(ticket.releases.length);

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

// The check counts in the order the review page prints them. A bucket that
// counts zero drops its fact.
const checkBuckets: ReadonlyArray<{ word: string; count: (pr: TicketPr) => number }> = [
	{ word: "failed", count: (pr) => pr.fail },
	{ word: "pending", count: (pr) => pr.pending },
	{ word: "passed", count: (pr) => pr.pass },
	{ word: "skipped", count: (pr) => pr.skipped },
];

const checkFacts = (pr: TicketPr): string[] =>
	checkBuckets.filter((bucket) => bucket.count(pr) > 0).map((bucket) => `${bucket.count(pr)} ${bucket.word}`);

// The review threads that nobody resolved.
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

// One pull request of a ticket, as the page prints it under the ticket row.
export const pullRequestRowText = (pr: TicketPr): string =>
	`#${pr.number}${gap}${factGroups.flatMap((factsOf) => factsOf(pr)).join(dot)}`;
