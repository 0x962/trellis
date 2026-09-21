import type { CiState, TicketSummary } from "@trellis/api";
import { type Check, CheckRibbon, cx, PrGlyph, Tooltip } from "@trellis/ui";
import type { Density } from "../../../../../stores/uiStore";

export type PrCellProps = {
	pr: NonNullable<TicketSummary["pr"]>;
	density: Density;
};

const dots: Record<CiState, string> = {
	pass: "bg-success",
	fail: "bg-danger",
	pending: "bg-warning",
	none: "bg-border-strong",
};

const ciLabels: Record<CiState, string> = {
	pass: "Checks passed",
	fail: "Checks failed",
	pending: "Checks pending",
	none: "No checks",
};

// The badge carries counts, not the checks themselves, so the ribbon draws
// one segment per counted check: the failed ones first.
const checksOf = (pr: PrCellProps["pr"]): Check[] => [
	...Array.from({ length: pr.fail }, () => ({ name: "1 check", bucket: "fail" as const })),
	...Array.from({ length: pr.pending }, () => ({ name: "1 check", bucket: "pending" as const })),
	...Array.from({ length: pr.pass }, () => ({ name: "1 check", bucket: "pass" as const })),
];

// A compact row has no room for the ribbon, so one dot states the CI result.
//
// TicketSummary.pr folds every linked pull request into one badge.
export function PrCell({ pr, density }: PrCellProps) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<PrGlyph state={pr.state} isDraft={pr.isDraft} isQueued={pr.isQueued} size="sm" />
			{density === "comfortable" ? (
				<CheckRibbon checks={checksOf(pr)} size="mini" />
			) : (
				<Tooltip content={ciLabels[pr.ciState]}>
					<span
						data-ci-dot={pr.ciState}
						role="img"
						aria-label={ciLabels[pr.ciState]}
						className={cx("size-1.5 shrink-0 rounded-sm", dots[pr.ciState])}
					/>
				</Tooltip>
			)}
		</span>
	);
}
