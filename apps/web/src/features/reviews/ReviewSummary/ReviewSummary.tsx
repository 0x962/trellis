import { type ReviewRevision, reviewRef } from "@trellis/api";
import { Badge } from "@trellis/ui";
export function ReviewSummary({
	pr,
	revision,
	openCount,
	draftCount,
}: {
	pr: string;
	revision: ReviewRevision | null;
	openCount: number;
	draftCount: number;
}) {
	const ref = reviewRef(pr);
	const meta = revision?.meta as
		| {
				title?: string;
				state?: string;
				isDraft?: boolean;
				author?: { login: string };
				headRefName?: string;
				baseRefName?: string;
				changedFiles?: number;
				additions?: number;
				deletions?: number;
		  }
		| undefined;
	return (
		<div className="review-heading">
			<h2>{meta?.title ?? `${ref.owner}/${ref.repo} #${ref.number}`}</h2>
			<div className="review-heading-meta">
				<Badge tone={meta?.state === "MERGED" ? "agent" : meta?.state === "OPEN" && !meta.isDraft ? "ok" : "neutral"}>
					{meta?.isDraft
						? "Draft"
						: meta?.state === "MERGED"
							? "Merged"
							: meta?.state === "CLOSED"
								? "Closed"
								: meta?.state === "OPEN"
									? "Open"
									: "Local review"}
				</Badge>
				{meta?.author && <span>{meta.author.login}</span>}
				{meta?.headRefName && (
					<span className="review-branch" title={`${meta.headRefName} → ${meta.baseRefName}`}>
						{meta.headRefName} <span aria-hidden="true">→</span> {meta.baseRefName}
					</span>
				)}
				{meta?.changedFiles !== undefined && (
					<span>
						{meta.changedFiles} files <span className="review-additions">+{meta.additions}</span>{" "}
						<span className="review-deletions">−{meta.deletions}</span>
					</span>
				)}
				{openCount > 0 && (
					<span>
						{openCount} open {openCount === 1 ? "thread" : "threads"}
					</span>
				)}
				{draftCount > 0 && (
					<span role="status" className="review-draft-count">
						{draftCount} {draftCount === 1 ? "draft" : "drafts"}
					</span>
				)}
			</div>
		</div>
	);
}
