import {
	GitMergeIcon,
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
	size?: PrGlyphSize;
};

type OcticonProps = { className?: string; "aria-hidden"?: "true" };

type Look = { label: string; tone: string; Icon: ComponentType<OcticonProps> };

// The shapes and the colors match GitHub, so a state reads the same in both products.
const looks = {
	open: { label: "Pull request open", tone: "text-success", Icon: GitPullRequestIcon },
	draft: { label: "Pull request draft", tone: "text-fg-muted", Icon: GitPullRequestDraftIcon },
	merged: { label: "Pull request merged", tone: "text-agent", Icon: GitMergeIcon },
	closed: { label: "Pull request closed", tone: "text-danger", Icon: GitPullRequestClosedIcon },
} as const satisfies Record<string, Look>;

export type PrStateWord = keyof typeof looks;

// The word for a pull request state, and the key of the glyph that draws it.
// GitHub shows the draft mark only while the pull request is open, so a
// merged pull request that was once a draft reads as merged.
export const prStateWord = (state: PullRequestState, isDraft: boolean): PrStateWord =>
	state === "open" && isDraft ? "draft" : state;

// A table row is 32 px tall and holds the small glyph. A pull request row has
// more room and holds the medium one.
const spanSizes: Record<PrGlyphSize, string> = { sm: "size-4", md: "size-5" };
const iconSizes: Record<PrGlyphSize, string> = { sm: "size-3.5", md: "size-4" };

// The glyph shows the state, never the check result. A failed check leaves an
// open pull request open. The caller draws the check result next to the glyph.
// The sr-only text names the state, so color is never the only signal.
export function PrGlyph({ state, isDraft, size = "md" }: PrGlyphProps) {
	const key = prStateWord(state, isDraft);
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
