import type { LinkedPullRequest, ReviewState, TicketSummary } from "@trellis/api";
import { ActorChip, CheckRibbon, cx, IconButton } from "@trellis/ui";
import { ExternalLink } from "lucide-react";
import { relativeTime, tabularClass } from "../../../../../lib/format";
import { useExpandedPr } from "../../../hooks/useExpandedPr";
import { CheckCountPill } from "./components/CheckCountPill";
import { CheckRows } from "./components/CheckRows";
import { MergedNudge } from "./components/MergedNudge";
import { OpenInMargin } from "./components/OpenInMargin";
import { PrActions } from "./components/PrActions";
import { PrStateIcon } from "./components/PrStateIcon";

export type PullRequestRowProps = {
	ticket: TicketSummary;
	pr: LinkedPullRequest;
};

const reviewLabels: Record<ReviewState, string | null> = {
	none: null,
	review_required: "Review required",
	approved: "Approved",
	changes_requested: "Changes requested",
};

const reviewTones: Record<ReviewState, string> = {
	none: "",
	review_required: "bg-accent-soft text-accent",
	approved: "bg-success-soft text-success",
	changes_requested: "bg-warning-soft text-warning",
};

// One pull request: the state, the ribbon, the counts, the review state, the
// branch pair, and who linked it. The header expands to the per-check rows.
// The header is 56 px tall, and a collapsed row is the header alone, so a
// row that gains a check pushes nothing below it. The actions menu sits
// beside the card, so the only expand control inside the card is the header.
export function PullRequestRow({ ticket, pr }: PullRequestRowProps) {
	const { expanded, toggle } = useExpandedPr(pr.id);
	const hasChecks = pr.checks.length > 0;
	const reviewLabel = reviewLabels[pr.reviewState];
	const header = (
		<>
			<PrStateIcon state={pr.state} isDraft={pr.isDraft} />
			<span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
				<span className="flex min-w-0 items-center gap-2">
					<span className="max-w-48 shrink-0 truncate font-mono text-sm text-fg-muted">
						{pr.owner}/{pr.repo}
					</span>
					<span className={cx("shrink-0 font-mono text-sm text-fg-muted", tabularClass)}>#{pr.number}</span>
					<span className="min-w-0 flex-1 truncate text-fg">{pr.title}</span>
					<CheckRibbon checks={pr.checks} />
					<CheckCountPill checks={pr.checks} />
					{reviewLabel !== null && (
						<span
							data-review-chip=""
							className={cx(
								"inline-flex h-5 shrink-0 items-center rounded-xl px-1.75 text-xs font-medium whitespace-nowrap",
								reviewTones[pr.reviewState],
							)}
						>
							{reviewLabel}
						</span>
					)}
				</span>
				<span className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
					<span className="flex min-w-0 items-center gap-1">
						<span className="truncate font-mono">{pr.headRef}</span>
						<span aria-hidden="true">→</span>
						<span className="shrink-0 font-mono">{pr.baseRef}</span>
					</span>
					<span className={cx("shrink-0", tabularClass)}>{relativeTime(pr.updatedAt)}</span>
					{pr.fetchError !== null && (
						<span data-pr-stale="" title={pr.fetchError} className={cx("shrink-0 text-warning", tabularClass)}>
							Stale, fetched {relativeTime(pr.fetchedAt!)}
						</span>
					)}
					{pr.linkedBy.kind !== "system" && <ActorChip name={pr.linkedBy.name} kind={pr.linkedBy.kind} />}
				</span>
			</span>
		</>
	);
	return (
		<div className="flex flex-col gap-1">
			<div className="group flex items-start gap-1">
				<div
					data-pr-row={pr.id}
					className={cx("flex min-w-0 flex-1 flex-col rounded-md border border-border bg-surface", !expanded && "h-14")}
				>
					<div className="flex h-14 shrink-0 items-center gap-3 px-3">
						{hasChecks ? (
							<button
								type="button"
								aria-expanded={expanded}
								onClick={toggle}
								className="flex h-14 min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
							>
								{header}
							</button>
						) : (
							<span className="flex h-14 min-w-0 flex-1 items-center gap-3">{header}</span>
						)}
						<IconButton
							label="Open on GitHub"
							icon={<ExternalLink />}
							className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
							onClick={() => window.open(pr.url, "_blank", "noopener")}
						/>
						<OpenInMargin url={pr.url} />
					</div>
					{expanded && <CheckRows checks={pr.checks} />}
				</div>
				<div className="flex h-14 shrink-0 items-center">
					<PrActions ticket={ticket} pr={pr} />
				</div>
			</div>
			<MergedNudge ticket={ticket} pr={pr} />
		</div>
	);
}
