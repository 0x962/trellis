import { Badge } from "../../primitives/Badge";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";
import { type PullRequestReviewState, ReviewStateIcon, reviewStateLabel } from "../ReviewStateIcon";

export type PullRequestReviewStatus = {
	owner: string;
	repo: string;
	number: number;
	reviewState: PullRequestReviewState;
	notReady: boolean;
};

export type ReviewStatusSummaryProps = {
	reviews: readonly PullRequestReviewStatus[];
	className?: string;
};

const visibleLimit = 5;

const reference = (review: PullRequestReviewStatus) => `${review.owner}/${review.repo}#${review.number}`;

export function ReviewStatusSummary({ reviews, className }: ReviewStatusSummaryProps) {
	const visible = reviews.slice(0, visibleLimit);
	const hidden = reviews.length - visible.length;
	return (
		<span className={cx("inline-flex shrink-0 items-center gap-0.5", className)}>
			<span className="sr-only">{reviews.length} pull request approval statuses</span>
			{visible.map((review) => (
				<ReviewStateIcon key={reference(review)} reviewState={review.reviewState} notReady={review.notReady} />
			))}
			{hidden > 0 && (
				<Tooltip
					content="Pull request reviews"
					description={
						<span className="flex flex-col gap-1">
							{reviews.map((review) => (
								<span key={reference(review)} className="flex items-center justify-between gap-4">
									<span className="truncate font-mono text-fg tabular">{reference(review)}</span>
									<span className="shrink-0">{reviewStateLabel(review.reviewState, review.notReady)}</span>
								</span>
							))}
						</span>
					}
					className="w-64"
				>
					<button
						type="button"
						aria-label={`Show all ${reviews.length} pull request approval statuses`}
						onClick={(event) => event.stopPropagation()}
						onPointerDown={(event) => event.stopPropagation()}
						className="inline-flex h-7 min-w-7 items-center justify-center rounded-round focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 pointer-coarse:h-11 pointer-coarse:min-w-11"
					>
						<Badge tone="accent" size="sm">
							+{hidden}
						</Badge>
					</button>
				</Tooltip>
			)}
		</span>
	);
}
