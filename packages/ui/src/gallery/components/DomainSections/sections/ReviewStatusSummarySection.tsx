import { type PullRequestReviewStatus, ReviewStatusSummary } from "../../../../domain/ReviewStatusSummary";
import { Section } from "../../Section";

const reviews: PullRequestReviewStatus[] = (
	[
		{ reviewState: "none", notReady: false },
		{ reviewState: "review_required", notReady: false },
		{ reviewState: "changes_requested", notReady: false },
		{ reviewState: "approved", notReady: false },
		{ reviewState: "approved", notReady: false },
		{ reviewState: "approved", notReady: false },
		{ reviewState: "review_required", notReady: false },
		{ reviewState: "changes_requested", notReady: false },
		{ reviewState: "none", notReady: true },
		{ reviewState: "approved", notReady: false },
	] as const
).map((review, index) => ({ ...review, owner: "0x962", repo: "trellis", number: 100 + index }));

export function ReviewStatusSummarySection() {
	return (
		<Section name="ReviewStatusSummary" note="five approval icons; five more behind a hover card">
			<ReviewStatusSummary reviews={reviews.slice(0, 5)} />
			<ReviewStatusSummary reviews={reviews} />
		</Section>
	);
}
