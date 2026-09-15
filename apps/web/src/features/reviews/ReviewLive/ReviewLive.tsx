import type { ReviewRevision } from "@trellis/api";
import { EmptyState } from "@trellis/ui";
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
				<dl className="review-status-grid">
					<div>
						<dt>Deploy on push</dt>
						<dd>
							{labels.some((label) => ["Live Branch: Enabled", "Lite Env: Enabled"].includes(label))
								? "Enabled"
								: "Disabled"}
						</dd>
					</div>
					<div>
						<dt>Keep after merge</dt>
						<dd>
							{labels.some((label) => ["Live Branch: Persist", "Lite Env: Persist"].includes(label)) ? "Yes" : "No"}
						</dd>
					</div>
				</dl>
				{status ? <ReviewMarkdown body={status.body} /> : <EmptyState description="No deployment report yet." />}
			</div>
		</div>
	);
}
