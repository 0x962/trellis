import { ArrowsClockwise } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";
import { type ReviewMetadata, ReviewStack } from "../../../ReviewStack/ReviewStack";

export function ReviewNotices({
	pr,
	hasRevision,
	metadata,
	metadataError,
	statusError,
	refreshError,
	threadsError,
	submissionsError,
	retrySubmissions,
}: {
	pr: string;
	hasRevision: boolean;
	metadata: ReviewMetadata | undefined;
	metadataError: Error | null;
	statusError: string | null;
	refreshError: string | null;
	threadsError: string | null;
	submissionsError: string | null;
	retrySubmissions: () => void;
}) {
	return (
		<div className="review-notices">
			{hasRevision && <ReviewStack pr={pr} meta={metadata} error={metadataError} />}
			{statusError !== null && <p role="alert" className="review-notice">GitHub status: {statusError}</p>}
			{refreshError !== null && (
				<p role="alert" className="review-error">{refreshError}. Local comments remain available.</p>
			)}
			{threadsError !== null && <p role="alert" className="review-error">{threadsError}</p>}
			{submissionsError !== null && (
				<div role="alert" className="review-error">
					Local review: {submissionsError}
					<Tooltip content="Retry local reviews">
						<IconButton label="Retry local reviews" icon={<ArrowsClockwise />} onClick={retrySubmissions} />
					</Tooltip>
				</div>
			)}
		</div>
	);
}
