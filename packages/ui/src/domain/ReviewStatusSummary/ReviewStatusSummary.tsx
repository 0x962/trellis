import { Badge } from "../../primitives/Badge";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";
import { PrGlyph, type PullRequestState, prGlyphLabel } from "../PrGlyph";

export type PullRequestReviewStatus = {
	owner: string;
	repo: string;
	number: number;
	state: PullRequestState;
	askedForReview: boolean;
	locallyApproved: boolean;
};

export type ReviewStatusSummaryProps = {
	reviews: readonly PullRequestReviewStatus[];
	className?: string;
	interactive?: boolean;
};

const visibleLimit = 5;

const reference = (review: PullRequestReviewStatus) => `${review.owner}/${review.repo}#${review.number}`;

export function ReviewStatusSummary({ reviews, className, interactive = true }: ReviewStatusSummaryProps) {
	const visible = reviews.slice(0, visibleLimit);
	const hidden = reviews.length - visible.length;
	return (
		<span className={cx("inline-flex shrink-0 items-center gap-0.5", className)}>
			<span className="sr-only">{reviews.length} pull request approval statuses</span>
			{visible.map((review) => (
				<PrGlyph
					key={reference(review)}
					state={review.state}
					askedForReview={review.askedForReview}
					locallyApproved={review.locallyApproved}
					size="sm"
				/>
			))}
			{hidden > 0 && !interactive && (
				<Badge tone="accent" size="sm">
					+{hidden}
				</Badge>
			)}
			{hidden > 0 && interactive && (
				<Tooltip
					content="Pull request reviews"
					description={
						<span className="flex flex-col gap-1">
							{reviews.map((review) => (
								<span key={reference(review)} className="flex items-center justify-between gap-4">
									<span className="truncate font-mono text-fg tabular">{reference(review)}</span>
									<span className="shrink-0">
										{prGlyphLabel(review.state, review.askedForReview, review.locallyApproved)}
									</span>
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
