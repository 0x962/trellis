import { type LinkedPullRequest, type ReviewRevision, reviewGapText, reviewRef } from "@trellis/api";
import { Badge, type BadgeTone, MergeConflictMark, PrGlyph, Tooltip } from "@trellis/ui";
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
	if (pullRequest?.state === "OPEN") return "ok";
	return "neutral";
};

// The poller stores the state and the merge state of a linked pull request.
// A pull request that no ticket links has only the answer of `gh pr view`.
export const hasConflict = (pullRequest: GithubPullRequest | undefined, linkedPr: LinkedPullRequest | null) =>
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
	// The Trellis row of the pull request when a ticket links it. It holds
	// what the pull request still needs before the person reviews it. A pull
	// request that no ticket links reads as ready for review.
	linkedPr: LinkedPullRequest | null;
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
	mergeQueuePosition,
	onAction,
}: ReviewIdentityProps) {
	const ref = reviewRef(pr);
	const localState = linkedPr?.localState ?? "ready";
	// Every part the pull request still needs before the person reviews it.
	// The glyph draws the ready mark from the count and names the first part
	// in its tooltip.
	const gaps = linkedPr === null ? [] : linkedPr.reviewGaps;
	const glyphState = pullRequest?.state === "MERGED" ? "merged" : pullRequest?.state === "CLOSED" ? "closed" : "open";
	const stateBadge = <Badge tone={stateTone(pullRequest, isQueued)}>{stateWord(pullRequest, isQueued)}</Badge>;
	return (
		<div className="review-heading">
			<div className="review-heading-title">
				<h2>{pullRequest?.title ?? `${ref.owner}/${ref.repo} #${ref.number}`}</h2>
				{/* One box per button, both drawn at the first paint. The GitHub
				    button appears when the stored revision arrives and the ...
				    menu appears when the ticket arrives, seconds apart. Each one
				    fills the box that waited for it, so neither one moves. */}
				<div className="review-header-actions">
					<div data-bar-slot="github" className="review-header-slot">
						{revision && <ReviewHeaderActions pr={pr} revision={revision} onDone={onAction} />}
					</div>
					<div data-bar-slot="local-state" className="review-header-slot">
						{linkedPr !== null && pullRequest?.state === "OPEN" && (
							<LocalStateMenu id={linkedPr.id} number={linkedPr.number} localState={localState} />
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
						{pullRequest !== undefined && (
							<PrGlyph
								state={glyphState}
								isQueued={isQueued}
								readyForReview={gaps.length === 0}
								reason={gaps[0] === undefined ? null : reviewGapText(gaps[0])}
								size="sm"
							/>
						)}
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
