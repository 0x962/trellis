import type { ReviewRevision } from "@trellis/api";
import { ReviewActions } from "../ReviewActions/ReviewActions";
import { ReviewMarkdown } from "../ReviewPage/ReviewMarkdown";
export function ReviewLive({
	pr,
	revision,
	onRefresh,
}: {
	pr: string;
	revision: ReviewRevision;
	onRefresh: () => void;
}) {
	const meta = revision.meta as { labels?: { name: string }[]; comments?: { body: string }[] };
	const labels = meta.labels?.map((l) => l.name) ?? [];
	const status = meta.comments?.filter((c) => c.body.includes("<!-- lite-env-dev-pod -->")).at(-1);
	return (
		<div className="review-scroll">
			<div className="review-list">
				<div className="review-header">
					<h2>Live Branch</h2>
					<ReviewActions pr={pr} revision={revision} live onDone={onRefresh} />
				</div>
				<p>
					Deploy on push:{" "}
					{labels.some((l) => ["Live Branch: Enabled", "Lite Env: Enabled"].includes(l)) ? "Enabled" : "Disabled"}
				</p>
				<p>
					Keep after merge:{" "}
					{labels.some((l) => ["Live Branch: Persist", "Lite Env: Persist"].includes(l)) ? "Yes" : "No"}
				</p>
				{status ? <ReviewMarkdown body={status.body} /> : <p>The workflow has no status report for this PR.</p>}
			</div>
		</div>
	);
}
