import { GithubLogo } from "@phosphor-icons/react";
import { type ReviewRevision, type ReviewThread, reviewRef } from "@trellis/api";
import { Badge, type BadgeTone, Tooltip } from "@trellis/ui";
// `ReviewHeaderActions` still lives under `ReviewSummary/components/` although
// `ReviewSummary` is gone. TRL-209 (T64) owns that tree and moves it here.
import { ReviewHeaderActions } from "../../../ReviewSummary/components/ReviewHeaderActions";

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

// GitHub can mark a pull request a draft while the state stays OPEN. The draft
// check comes first, so the badge then reads Draft.
export const stateWord = (pullRequest: GithubPullRequest | undefined) => {
	if (pullRequest === undefined) return "Not fetched";
	if (pullRequest.isDraft) return "Draft";
	if (pullRequest.state === "MERGED") return "Merged";
	if (pullRequest.state === "CLOSED") return "Closed";
	if (pullRequest.state === "OPEN") return "Open";
	return "Not fetched";
};

export const stateTone = (pullRequest: GithubPullRequest | undefined): BadgeTone => {
	if (pullRequest?.state === "MERGED") return "agent";
	if (pullRequest?.state === "OPEN" && !pullRequest.isDraft) return "ok";
	return "neutral";
};

export type ReviewIdentityProps = {
	pr: string;
	// The revision with the fields of the newest GitHub poll, or `null` while
	// no revision arrived. The buttons need a revision, so they wait for it.
	revision: ReviewRevision | null;
	pullRequest: GithubPullRequest | undefined;
	// Every thread that nobody resolved. A review submission carries them to
	// GitHub.
	openThreads: ReviewThread[];
	onAction: () => void;
};

// The title, the state, the branch and the buttons that end a review.
// `ConditionsBlock` prints the size, the open thread count and the distance
// from the base branch, so this band prints none of those three.
export function ReviewIdentity({ pr, revision, pullRequest, openThreads, onAction }: ReviewIdentityProps) {
	const ref = reviewRef(pr);
	return (
		<div className="review-heading">
			<div className="review-heading-title">
				<h2>{pullRequest?.title ?? `${ref.owner}/${ref.repo} #${ref.number}`}</h2>
				{revision && (
					<ReviewHeaderActions pr={pr} revision={revision} openThreads={openThreads} showReview onDone={onAction} />
				)}
			</div>
			<div className="review-heading-meta">
				<Badge tone={stateTone(pullRequest)}>{stateWord(pullRequest)}</Badge>
				{pullRequest?.mergeable === "CONFLICTING" && (
					<Tooltip content="Open merge conflicts on GitHub">
						<a className="inline-flex items-center gap-1.5" href={`${pr}/conflicts`} target="_blank" rel="noreferrer">
							<GithubLogo aria-hidden="true" className="size-3.5" />
							<Badge tone="wait">Merge conflicts</Badge>
						</a>
					</Tooltip>
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
