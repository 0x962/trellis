import type { CiState, PrState } from "@trellis/api";
import { cx } from "@trellis/ui";
import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import type { ComponentType } from "react";

export type PrStateIconProps = {
	state: PrState;
	isDraft: boolean;
	ciState: CiState;
};

type Look = { label: string; tone: string; Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }> };

const looks: Record<"open" | "draft" | "blocked" | "merged" | "closed", Look> = {
	open: { label: "Open", tone: "text-success", Icon: GitPullRequest },
	draft: { label: "Draft", tone: "text-fg-muted", Icon: GitPullRequestDraft },
	blocked: { label: "Blocked", tone: "text-danger", Icon: GitPullRequest },
	merged: { label: "Merged", tone: "text-agent", Icon: GitMerge },
	closed: { label: "Closed", tone: "text-danger", Icon: GitPullRequestClosed },
};

// A merged or a closed pull request keeps its own look, because a check that
// failed before the merge says nothing about the branch now. A draft keeps
// the muted look, because a draft is not ready for a merge whatever the
// checks report. An open pull request that gh reports with a failed check is
// `blocked`: a merge waits for a green check.
const lookOf = (state: PrState, isDraft: boolean, ciState: CiState) => {
	if (state !== "open") return state;
	if (isDraft) return "draft";
	return ciState === "fail" ? "blocked" : "open";
};

// The state of one pull request as one icon. The color carries the state and
// the sr-only text names it, so color is never the only signal.
export function PrStateIcon({ state, isDraft, ciState }: PrStateIconProps) {
	const key = lookOf(state, isDraft, ciState);
	const { label, tone, Icon } = looks[key];
	return (
		<span
			data-pr-state={key}
			title={label}
			className={cx("relative inline-flex size-5 shrink-0 items-center justify-center", tone)}
		>
			<Icon className="size-4" aria-hidden={true} />
			<span className="sr-only">{label}</span>
		</span>
	);
}
