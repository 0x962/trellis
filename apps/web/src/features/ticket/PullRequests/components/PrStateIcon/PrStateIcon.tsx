import type { LinkedPullRequest } from "@trellis/api";
import { GitMerge, GitPullRequestArrow, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";

export type PrStateIconProps = {
	pr: Pick<LinkedPullRequest, "state" | "isDraft">;
};

// The pull request state as an icon with a name: open green, draft grey
// and dashed, merged in the agent purple, closed red. The name is what a
// screen reader gets, so color is never the only signal.
export function PrStateIcon({ pr }: PrStateIconProps) {
	if (pr.state === "merged") {
		return (
			<span role="img" aria-label="Merged pull request" className="inline-flex size-4 shrink-0 text-agent *:size-full">
				<GitMerge />
			</span>
		);
	}
	if (pr.state === "closed") {
		return (
			<span role="img" aria-label="Closed pull request" className="inline-flex size-4 shrink-0 text-danger *:size-full">
				<GitPullRequestClosed />
			</span>
		);
	}
	if (pr.isDraft) {
		return (
			<span
				role="img"
				aria-label="Draft pull request"
				className="inline-flex size-4 shrink-0 text-fg-faint *:size-full"
			>
				<GitPullRequestDraft />
			</span>
		);
	}
	return (
		<span role="img" aria-label="Open pull request" className="inline-flex size-4 shrink-0 text-success *:size-full">
			<GitPullRequestArrow />
		</span>
	);
}
