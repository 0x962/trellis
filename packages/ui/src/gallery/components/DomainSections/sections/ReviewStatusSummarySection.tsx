import { type PullRequestReviewStatus, ReviewStatusSummary } from "../../../../domain/ReviewStatusSummary";
import { Section } from "../../Section";

const reviews: PullRequestReviewStatus[] = (
	[
		{ state: "open", askedForReview: true, locallyApproved: false },
		{ state: "open", askedForReview: true, locallyApproved: false },
		{ state: "open", askedForReview: true, locallyApproved: false },
		{ state: "open", askedForReview: true, locallyApproved: true },
		{ state: "open", askedForReview: true, locallyApproved: true },
		{ state: "open", askedForReview: true, locallyApproved: true },
		{ state: "open", askedForReview: true, locallyApproved: false },
		{ state: "open", askedForReview: true, locallyApproved: false },
		{ state: "open", askedForReview: false, locallyApproved: false },
		{ state: "open", askedForReview: true, locallyApproved: true },
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
