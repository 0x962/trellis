import type { CiState, TicketSummary } from "@trellis/api";
import { type Check, CheckRibbon, cx } from "@trellis/ui";
import { GitMerge, GitPullRequestArrow, GitPullRequestClosed } from "lucide-react";
import type { Density } from "../../../../../stores/uiStore";

export type PrCellProps = {
	pr: NonNullable<TicketSummary["pr"]>;
	density: Density;
};

const icons = {
	open: { Icon: GitPullRequestArrow, className: "text-success", label: "PR open" },
	merged: { Icon: GitMerge, className: "text-agent", label: "PR merged" },
	closed: { Icon: GitPullRequestClosed, className: "text-danger", label: "PR closed" },
} as const;

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

// The PR state icon with the mini check ribbon. A compact row has no room
// for the ribbon, so one dot states the CI result.
export function PrCell({ pr, density }: PrCellProps) {
	const { Icon, className, label } = icons[pr.state];
	return (
		<span className="inline-flex items-center gap-1.5">
			<Icon role="img" aria-label={label} className={cx("size-3.5 shrink-0", className)} />
			{density === "comfortable" ? (
				<CheckRibbon checks={checksOf(pr)} size="mini" />
			) : (
				<span
					data-ci-dot={pr.ciState}
					role="img"
					aria-label={ciLabels[pr.ciState]}
					className={cx("size-1.5 shrink-0 rounded-sm", dots[pr.ciState])}
				/>
			)}
		</span>
	);
}
