import { type LinkedPullRequest, type ReviewRevision, reviewRef } from "@trellis/api";
import { Badge, type BadgeTone, MergeConflictMark, PrGlyph } from "@trellis/ui";
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

// GitHub can mark a pull request as queued or draft while its state stays OPEN.
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

export type ReviewIdentityProps = {
	pr: string;
	// The revision with the fields of the newest GitHub poll, or `null` while
	// no revision arrived. The buttons need a revision, so they wait for it.
	revision: ReviewRevision | null;
	pullRequest: GithubPullRequest | undefined;
	isQueued: boolean;
	// The Trellis row of the pull request when a ticket links it. It holds the
	// local review state. A pull request that no ticket links reads as ready.
	linkedPr: LinkedPullRequest | null;
	onAction: () => void;
};

// The title, the state, the branch and the buttons that end a review.
export function ReviewIdentity({ pr, revision, pullRequest, isQueued, linkedPr, onAction }: ReviewIdentityProps) {
	const ref = reviewRef(pr);
	const localState = linkedPr?.localState ?? "ready";
	const glyphState = pullRequest?.state === "MERGED" ? "merged" : pullRequest?.state === "CLOSED" ? "closed" : "open";
	return (
		<div className="review-heading">
			<div className="review-heading-title">
				<h2>{pullRequest?.title ?? `${ref.owner}/${ref.repo} #${ref.number}`}</h2>
				<div className="review-header-actions">
					{revision && <ReviewHeaderActions pr={pr} revision={revision} onDone={onAction} />}
					{linkedPr !== null && pullRequest?.state === "OPEN" && (
						<LocalStateMenu id={linkedPr.id} number={linkedPr.number} localState={localState} />
					)}
				</div>
			</div>
			<div className="review-heading-meta">
				{pullRequest !== undefined && (
					<PrGlyph
						state={glyphState}
						isDraft={pullRequest.isDraft ?? false}
						isQueued={isQueued}
						localState={localState}
						size="sm"
					/>
				)}
				<Badge tone={stateTone(pullRequest, isQueued)}>{stateWord(pullRequest, isQueued)}</Badge>
				{hasConflict(pullRequest, linkedPr) && (
					<a className="inline-flex" href={`${pr}/conflicts`} target="_blank" rel="noreferrer">
						<MergeConflictMark baseRef={linkedPr?.baseRef ?? pullRequest?.baseRefName ?? ""} />
					</a>
				)}
				{pullRequest?.headRefName && (
					<span className="review-branch" title={`${pullRequest.headRefName} → ${pullRequest.baseRefName}`}>
						{pullRequest.headRefName} <span aria-hidden="true">→</span> {pullRequest.baseRefName}
					</span>
				)}
			</div>
		</div>
	);
}
