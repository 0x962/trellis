import {
	GitMergeIcon,
	GitMergeQueueIcon,
	GitPullRequestClosedIcon,
	GitPullRequestDraftIcon,
	GitPullRequestIcon,
} from "@primer/octicons-react";
import type { ComponentType } from "react";
import { cx } from "../../utils/cx";

export type PullRequestState = "open" | "closed" | "merged";

export type PrGlyphSize = "sm" | "md";

export type PrGlyphProps = {
	state: PullRequestState;
	isDraft: boolean;
	isQueued: boolean;
	size?: PrGlyphSize;
};

type OcticonProps = { className?: string; "aria-hidden"?: "true" };

type Look = { label: string; tone: string; Icon: ComponentType<OcticonProps> };

// The shapes and the colors match GitHub, so a state reads the same in both products.
const looks = {
	open: { label: "Pull request open", tone: "text-success", Icon: GitPullRequestIcon },
	draft: { label: "Pull request draft", tone: "text-fg-muted", Icon: GitPullRequestDraftIcon },
	queued: { label: "Pull request queued", tone: "text-warning", Icon: GitMergeQueueIcon },
	merged: { label: "Pull request merged", tone: "text-agent", Icon: GitMergeIcon },
	closed: { label: "Pull request closed", tone: "text-danger", Icon: GitPullRequestClosedIcon },
} as const satisfies Record<string, Look>;

type PrGlyphLook = keyof typeof looks;

// GitHub shows the draft and queued marks only while the pull request is open.
export const prGlyphLook = (state: PullRequestState, isDraft: boolean, isQueued: boolean): PrGlyphLook => {
	if (state === "open" && isQueued) return "queued";
	return state === "open" && isDraft ? "draft" : state;
};

// A table row is 32 px tall and holds the small glyph. A pull request row has
// more room and holds the medium one.
const spanSizes: Record<PrGlyphSize, string> = { sm: "size-4", md: "size-5" };
const iconSizes: Record<PrGlyphSize, string> = { sm: "size-3.5", md: "size-4" };

// The glyph shows the state, never the check result. A failed check leaves an
// open pull request open. The caller draws the check result next to the glyph.
// The sr-only text names the state, so color is never the only signal.
export function PrGlyph({ state, isDraft, isQueued, size = "md" }: PrGlyphProps) {
	const key = prGlyphLook(state, isDraft, isQueued);
	const { label, tone, Icon } = looks[key];
	return (
		<span
			data-pr-glyph={key}
			title={label}
			className={cx("relative inline-flex shrink-0 items-center justify-center", spanSizes[size], tone)}
		>
			<Icon className={cx("shrink-0", iconSizes[size])} aria-hidden="true" />
			<span className="sr-only">{label}</span>
		</span>
	);
}
