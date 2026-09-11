import type { PrState } from "@trellis/api";
import { cx } from "@trellis/ui";
import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import type { ComponentType } from "react";

export type PrStateIconProps = {
	state: PrState;
	isDraft: boolean;
};

// The dashed border distinguishes a draft from other pull request states
// without color.
type Look = { label: string; tone: string; Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }> };

const looks: Record<"open" | "draft" | "merged" | "closed", Look> = {
	open: { label: "Open", tone: "text-success", Icon: GitPullRequest },
	draft: { label: "Draft", tone: "border border-dashed border-current text-fg-muted", Icon: GitPullRequestDraft },
	merged: { label: "Merged", tone: "text-agent", Icon: GitMerge },
	closed: { label: "Closed", tone: "text-danger", Icon: GitPullRequestClosed },
};

// The state of one pull request as an icon and a text label. Color is never
// the only signal, so every state names itself for a screen reader.
export function PrStateIcon({ state, isDraft }: PrStateIconProps) {
	const key = state === "open" && isDraft ? "draft" : state;
	const { label, tone, Icon } = looks[key];
	return (
		<span
			data-pr-state={key}
			title={label}
			className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-sm", tone)}
		>
			<Icon className="size-3.5" aria-hidden={true} />
			<span className="sr-only">{label}</span>
		</span>
	);
}
