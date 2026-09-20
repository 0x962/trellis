import type { TicketPr } from "@trellis/api";
import { cx, PrGlyph } from "@trellis/ui";
import { Fragment } from "react";
import { tabularClass } from "../../../lib/format";
import { prRowHeight } from "../rowHeights";

export type PrRowProps = {
	pr: TicketPr;
	// The offset of this line inside the virtual body.
	top: number;
};

// GitHub marks a pull request as a draft only while it is open, so a merged
// pull request that was once a draft reads as merged here too.
const stateWord = (pr: TicketPr) => (pr.state === "open" && pr.isDraft ? "draft" : pr.state);

// The check counts in the order the review page prints them, each with the
// word that names it. A count of zero prints nothing, so a pull request with
// no failed check never prints `0 failed`.
const checkCounts: ReadonlyArray<{ word: string; tone?: string; count: (pr: TicketPr) => number }> = [
	{ word: "failed", tone: "text-danger", count: (pr) => pr.fail },
	{ word: "pending", count: (pr) => pr.pending },
	{ word: "passed", count: (pr) => pr.pass },
	{ word: "skipped", count: (pr) => pr.skipped },
];

const wordsOf = (pr: TicketPr) => [
	{ key: "state", text: stateWord(pr), tone: undefined as string | undefined },
	...checkCounts
		.filter((check) => check.count(pr) > 0)
		.map((check) => ({ key: check.word, text: `${check.count(pr)} ${check.word}`, tone: check.tone })),
];

// One pull request of a ticket, on the line under that ticket's row in the
// epic table. The line is 32 px tall whatever it holds, because the
// virtualizer reserves that height before the line renders.
//
// The line is text, not a control. The pull request opens from the ticket
// page and from the review page.
export function PrRow({ pr, top }: PrRowProps) {
	return (
		<div
			data-pr-row={`${pr.owner}/${pr.repo}#${pr.number}`}
			style={{ height: `${prRowHeight}px`, transform: `translateY(${top}px)` }}
			className="absolute top-0 left-0 flex w-full items-center gap-2 border-b border-border pr-5 pl-11 text-sm text-fg-muted max-md:pr-4 max-md:pl-10"
		>
			<PrGlyph state={pr.state} isDraft={pr.isDraft} size="sm" />
			<span className={cx("shrink-0 text-fg", tabularClass)}>#{pr.number}</span>
			{wordsOf(pr).map((word, index) => (
				<Fragment key={word.key}>
					{index > 0 && (
						<span aria-hidden="true" className="shrink-0 text-fg-faint">
							·
						</span>
					)}
					<span className={cx("shrink-0", word.tone)}>{word.text}</span>
				</Fragment>
			))}
		</div>
	);
}
