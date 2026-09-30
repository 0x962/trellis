import { ArrowsClockwise } from "@phosphor-icons/react";
import type { PullRequestEvidence, PullRequestSummary, ReviewRevision, ReviewThread } from "@trellis/api";
import { IconButton, Skeleton, Tooltip } from "@trellis/ui";
import { type DiffAnchor, threadDiffLine } from "@trellis/ui/review";
import { ChangeSummary } from "../../../ChangeSummary";
import { EvidenceDocument } from "../../../EvidenceDocument";
import { ReviewFindings } from "../../../ReviewFindings";

export function ReviewOverview({
	ready,
	error,
	onRetry,
	linked,
	summary,
	evidence,
	threads,
	revision,
	onOpen,
}: {
	ready: boolean;
	error: Error | null;
	onRetry: () => void;
	linked: boolean;
	summary: PullRequestSummary | null;
	evidence: PullRequestEvidence | null;
	threads: ReviewThread[];
	revision: ReviewRevision | null;
	onOpen: (path: string, anchor: DiffAnchor | null) => void;
}) {
	return (
		<div className="review-blocks">
			{error && (
				<div role="alert" className="review-error">
					Overview: {error.message}
					<Tooltip content="Retry overview">
						<IconButton label="Retry overview" icon={<ArrowsClockwise />} onClick={onRetry} />
					</Tooltip>
				</div>
			)}
			{!ready ? (
				<section aria-busy="true">
					<span className="sr-only" role="status">
						The overview is loading.
					</span>
					<Skeleton lines={10} />
				</section>
			) : (
				<>
					{linked && <ChangeSummary summary={summary} />}
					{linked && <EvidenceDocument evidence={evidence} />}
					<ReviewFindings
						threads={threads}
						revisionId={revision?.id ?? null}
						onOpen={(thread) => {
							const line = revision === null ? null : threadDiffLine(revision.patch, thread, revision.id);
							onOpen(
								line === null ? thread.path : "",
								line === null ? null : { path: thread.path, side: thread.side, line, startLine: line },
							);
						}}
					/>
				</>
			)}
		</div>
	);
}
