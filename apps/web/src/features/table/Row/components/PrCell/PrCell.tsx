import { askedForReview, missingPartsText, type TicketSummary } from "@trellis/api";
import { type Check, CheckRibbon, PrGlyph } from "@trellis/ui";

export type PrCellProps = {
	pr: NonNullable<TicketSummary["pr"]>;
};

// The badge carries counts, not the checks themselves, so the ribbon draws
// one segment per counted check: the failed ones first.
const checksOf = (pr: PrCellProps["pr"]): Check[] => [
	...Array.from({ length: pr.fail }, () => ({ name: "1 check", bucket: "fail" as const })),
	...Array.from({ length: pr.pending }, () => ({ name: "1 check", bucket: "pending" as const })),
	...Array.from({ length: pr.pass }, () => ({ name: "1 check", bucket: "pass" as const })),
];

// TicketSummary.pr folds every linked pull request into one badge.
export function PrCell({ pr }: PrCellProps) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<PrGlyph
				state={pr.state}
				askedForReview={askedForReview(pr)}
				locallyApproved={pr.locallyApproved}
				description={missingPartsText(pr)}
				size="sm"
			/>
			<CheckRibbon checks={checksOf(pr)} size="mini" />
		</span>
	);
}
