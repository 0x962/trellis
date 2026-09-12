import { createFileRoute } from "@tanstack/react-router";
import { reviewRef } from "@trellis/api";
import { ReviewPage } from "../features/reviews/ReviewPage/ReviewPage";
export const Route = createFileRoute("/reviews_/$owner/$repo/$number")({ component: Page });
function Page() {
	const { owner, repo, number } = Route.useParams();
	const pr = reviewRef(`${owner}/${repo}#${number}`).url;
	return <ReviewPage key={pr} pr={pr} />;
}
