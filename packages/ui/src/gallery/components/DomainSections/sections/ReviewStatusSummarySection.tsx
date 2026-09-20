import { type PullRequestReviewStatus, ReviewStatusSummary } from "../../../../domain/ReviewStatusSummary";
import { Section } from "../../Section";

const reviews: PullRequestReviewStatus[] = (
	[
		{ reviewState: "none", isDraft: false },
		{ reviewState: "review_required", isDraft: false },
		{ reviewState: "changes_requested", isDraft: false },
		{ reviewState: "approved", isDraft: false },
		{ reviewState: "approved", isDraft: false },
		{ reviewState: "approved", isDraft: false },
		{ reviewState: "review_required", isDraft: false },
		{ reviewState: "changes_requested", isDraft: false },
		{ reviewState: "none", isDraft: true },
		{ reviewState: "approved", isDraft: false },
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
