import type { TicketPr } from "@trellis/api";
import { type Check, CheckRibbon } from "@trellis/ui";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { PrCells } from "../PrCells";
import { prRowHeight } from "../rowHeights";
import { prRowCells } from "./prRowText";

export type PrRowProps = {
	pr: TicketPr;
	// The offset of this line inside the virtual body.
	top: number;
};

const checksOf = (pr: TicketPr): Check[] => [
	...Array.from({ length: pr.fail }, () => ({ name: "1 check", bucket: "fail" as const })),
	...Array.from({ length: pr.pending }, () => ({ name: "1 check", bucket: "pending" as const })),
	...Array.from({ length: pr.pass }, () => ({ name: "1 check", bucket: "pass" as const })),
	...Array.from({ length: pr.skipped }, () => ({ name: "1 check", bucket: "skipping" as const })),
];

// One pull request of a ticket, on the line under that ticket's row in the
// epic table. The line is 32 px tall whatever it holds, because the
// virtualizer reserves that height before the line renders. Below 768 px
// the table draws no such line, and the phone row shows the pull request.
//
// A click opens the review in the wide sheet over this list.
//
// `overflow-hidden` on the row and `shrink-0` on each cell keep the cells
// at their full width. A narrow window cuts the last cells off at the right
// edge. No cell wraps, and the row never scrolls sideways.
export function PrRow({ pr, top }: PrRowProps) {
	return (
		<button
			type="button"
			data-pr-row={`${pr.owner}/${pr.repo}#${pr.number}`}
			style={{ height: `${prRowHeight}px`, transform: `translateY(${top}px)` }}
			className="absolute top-0 left-0 flex w-full items-center gap-2 overflow-hidden border-b border-border pr-5 pl-19 text-left text-sm text-fg-muted transition-colors duration-hover hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			onClick={() => pageSheetActions.openPullRequest(pr.url)}
		>
			<PrCells pr={pr} cells={prRowCells(pr)} />
			<CheckRibbon checks={checksOf(pr)} size="wide" />
		</button>
	);
}
