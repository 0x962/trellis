import { LinkSimple } from "@phosphor-icons/react";
import {
	internalLink,
	type LocalPrState,
	missingPartsText,
	type ReviewOverview,
	type ReviewRevision,
	reviewRef,
} from "@trellis/api";
import { Badge, type BadgeTone, IconButton, MergeConflictMark, PrGlyph, Tooltip } from "@trellis/ui";
import { copyText } from "../../../../../lib/clipboard";
import { ReviewHeaderActions } from "../../../ReviewHeaderActions";
import { LocalStateMenu } from "./components/LocalStateMenu";

// `revision.meta` holds the answer of `gh pr view` and has no type. This type
// lists the fields that the band shows.
export type GithubPullRequest = {
	title?: string;
	state?: string;
	isDraft?: boolean;
	mergeable?: string;
	headRefName?: string;
	baseRefName?: string;
};

// GitHub can mark a pull request as queued while its state stays OPEN.
export const stateWord = (pullRequest: GithubPullRequest | undefined, isQueued = false) => {
	if (isQueued) return "Queued";
	if (pullRequest === undefined) return "Not fetched";
	if (pullRequest.state === "MERGED") return "Merged";
	if (pullRequest.state === "CLOSED") return "Closed";
	if (pullRequest.state === "OPEN") return "Open";
	return "Not fetched";
};

export const stateTone = (pullRequest: GithubPullRequest | undefined, isQueued = false): BadgeTone => {
	if (isQueued) return "wait";
	if (pullRequest?.state === "MERGED") return "agent";
	return "neutral";
};

// The saved overview supplies the poller state and merge state.
// A remote-only pull request uses the answer from `gh pr view`.
export const hasConflict = (
	pullRequest: GithubPullRequest | undefined,
	linkedPr: ReviewOverview["pullRequest"] | null,
) =>
	linkedPr === null
		? pullRequest?.state === "OPEN" && pullRequest.mergeable === "CONFLICTING"
		: linkedPr.state === "open" && linkedPr.mergeable === "conflicting";

export const queuePositionText = (position: number | null | undefined) =>
	position === undefined ? "Position ..." : `Position ${position ?? "pending"}`;

export const queueTooltipText = (position: number | null | undefined) =>
	position === undefined
		? "In the merge queue. Position is loading."
		: `In the merge queue · ${queuePositionText(position)}`;

export type ReviewIdentityProps = {
	pr: string;
	// The revision with the fields of the newest GitHub poll, or `null` while
	// no revision arrived. The buttons need a revision, so they wait for it.
	revision: ReviewRevision | null;
	pullRequest: GithubPullRequest | undefined;
	isQueued: boolean;
	linkedPr: ReviewOverview["pullRequest"] | null;
	localState: LocalPrState | null;
	locallyApproved: boolean | null;
	mergeQueuePosition?: number | null;
	onAction: () => void;
};

// The title, the state, the branch and the buttons that end a review.
export function ReviewIdentity({
	pr,
	revision,
	pullRequest,
	isQueued,
	linkedPr,
	localState,
	locallyApproved,
	mergeQueuePosition,
	onAction,
}: ReviewIdentityProps) {
	const ref = reviewRef(pr);
	const glyphState = pullRequest?.state === "MERGED" ? "merged" : pullRequest?.state === "CLOSED" ? "closed" : "open";
	const stateBadge = <Badge tone={stateTone(pullRequest, isQueued)}>{stateWord(pullRequest, isQueued)}</Badge>;
	return (
		<div className="review-heading">
			<div className="review-heading-title">
				<h2>{pullRequest?.title ?? `${ref.owner}/${ref.repo} #${ref.number}`}</h2>
				{/* One box per button, all drawn at the first paint. The GitHub
				    button and link appear when the stored revision arrives. The ...
				    menu uses the saved pull request. Each control
				    fills the box that waited for it, so neither one moves. */}
				<div className="review-header-actions">
					<div data-bar-slot="github" className="review-header-slot">
						{revision && <ReviewHeaderActions pr={pr} revision={revision} onDone={onAction} />}
					</div>
					<div data-bar-slot="local-state" className="review-header-slot">
						{linkedPr !== null && pullRequest?.state === "OPEN" && (
							<LocalStateMenu id={linkedPr.id} number={linkedPr.number} localState={linkedPr.localState} />
						)}
					</div>
					<div data-bar-slot="internal-link" className="review-header-slot">
						{revision !== null && (
							<Tooltip content="Copy Trellis link">
								<IconButton
									label="Copy Trellis link"
									icon={<LinkSimple />}
									variant="default"
									onClick={() => void copyText(internalLink("pr", revision.prId), "Pull request link copied")}
								/>
							</Tooltip>
						)}
					</div>
				</div>
			</div>
			{/* The row is ordered by the moment each fact arrives. The two marks
			    open it and keep their boxes from the first paint. The state
			    word, the branch and the queue position follow in the order the
			    reads answer, so a later answer appends to the row and moves
			    nothing that was drawn before it. */}
			<div className="review-heading-meta">
				<span className="review-meta-marks">
					<span data-bar-slot="glyph" className="review-meta-glyph">
						{pullRequest !== undefined &&
							(glyphState === "open" && locallyApproved === null ? (
								<span role="status" className="sr-only">
									Local approval is unavailable.
								</span>
							) : (
								<PrGlyph
									state={glyphState}
									askedForReview={localState === "ready"}
									locallyApproved={locallyApproved === true}
									description={linkedPr === null ? null : missingPartsText(linkedPr)}
									size="sm"
								/>
							))}
					</span>
					<span data-bar-slot="conflict" className="review-meta-conflict">
						{hasConflict(pullRequest, linkedPr) && (
							<a className="inline-flex" href={`${pr}/conflicts`} target="_blank" rel="noreferrer">
								<MergeConflictMark baseRef={linkedPr?.baseRef ?? pullRequest?.baseRefName ?? ""} />
							</a>
						)}
					</span>
				</span>
				{isQueued ? (
					<Tooltip content={queueTooltipText(mergeQueuePosition)}>
						<span className="review-state-group">{stateBadge}</span>
					</Tooltip>
				) : (
					stateBadge
				)}
				{pullRequest?.headRefName && (
					<span className="review-branch" title={`${pullRequest.headRefName} → ${pullRequest.baseRefName}`}>
						{pullRequest.headRefName} <span aria-hidden="true">→</span> {pullRequest.baseRefName}
					</span>
				)}
				{/* The merge queue read answers after every other read of the
				    header, so the position ends the row. */}
				{isQueued && <span className="review-queue-position">{queuePositionText(mergeQueuePosition)}</span>}
			</div>
		</div>
	);
}
