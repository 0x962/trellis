import {
	GitMergeIcon,
	GitMergeQueueIcon,
	GitPullRequestClosedIcon,
	GitPullRequestDraftIcon,
	GitPullRequestIcon,
} from "@primer/octicons-react";
import type { ComponentType } from "react";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";

export type PullRequestState = "open" | "closed" | "merged";

export type PrGlyphSize = "sm" | "md";

// The review state that records whether the agent asked for review.
export type LocalPrState = "draft" | "ready";

export type PrGlyphProps = {
	state: PullRequestState;
	isQueued: boolean;
	localState: LocalPrState;
	size?: PrGlyphSize;
	tooltip?: boolean;
	focusable?: boolean;
	decorative?: boolean;
};

type OcticonProps = { className?: string; "aria-hidden"?: "true" };

type Look = { label: string; tone: string; Icon: ComponentType<OcticonProps> };

// The shapes and the colors match GitHub, so a state reads the same in both
// products. The draft shape means the agent has not asked for review.
const looks = {
	open: { label: "Ready for review", tone: "text-success", Icon: GitPullRequestIcon },
	draft: {
		label: "Draft: the agent has not asked for review",
		tone: "text-fg-muted",
		Icon: GitPullRequestDraftIcon,
	},
	queued: { label: "Pull request queued", tone: "text-warning", Icon: GitMergeQueueIcon },
	merged: { label: "Pull request merged", tone: "text-agent", Icon: GitMergeIcon },
	closed: { label: "Pull request closed", tone: "text-danger", Icon: GitPullRequestClosedIcon },
} as const satisfies Record<string, Look>;

type PrGlyphLook = keyof typeof looks;

// Queued and draft marks apply only while the pull request is open.
export const prGlyphLook = (state: PullRequestState, isQueued: boolean, localState: LocalPrState): PrGlyphLook => {
	if (state !== "open") return state;
	if (isQueued) return "queued";
	return localState === "draft" ? "draft" : "open";
};

// A table row is 32 px tall and holds the small glyph. A pull request row has
// more room and holds the medium one.
const spanSizes: Record<PrGlyphSize, string> = { sm: "size-4", md: "size-5" };
const iconSizes: Record<PrGlyphSize, string> = { sm: "size-4", md: "size-4" };

// The glyph shows the state, never the check result. A failed check leaves an
// open pull request open. The caller draws the check result next to the glyph.
// The accessible name and the tooltip use the same words, so color is never
// the only signal.
export function PrGlyph({
	state,
	isQueued,
	localState,
	size = "md",
	tooltip = true,
	focusable = true,
	decorative = false,
}: PrGlyphProps) {
	const key = prGlyphLook(state, isQueued, localState);
	const { label, tone, Icon } = looks[key];
	if (decorative) {
		return (
			<span
				data-pr-glyph={key}
				aria-hidden="true"
				className={cx("relative inline-flex shrink-0 items-center justify-center", spanSizes[size], tone)}
			>
				<Icon className={cx("shrink-0", iconSizes[size])} aria-hidden="true" />
			</span>
		);
	}
	const glyph = (
		<span
			data-pr-glyph={key}
			role="img"
			aria-label={label}
			tabIndex={tooltip && focusable ? 0 : undefined}
			className={cx("relative inline-flex shrink-0 items-center justify-center", spanSizes[size], tone)}
		>
			<Icon className={cx("shrink-0", iconSizes[size])} aria-hidden="true" />
		</span>
	);
	return tooltip ? <Tooltip content={label}>{glyph}</Tooltip> : glyph;
}
