import {
	GitMergeIcon,
	GitPullRequestClosedIcon,
	GitPullRequestDraftIcon,
	GitPullRequestIcon,
} from "@primer/octicons-react";
import type { ComponentType } from "react";
import { cx } from "../../utils/cx";

export type PrGlyphState = "open" | "closed" | "merged";

export type PrGlyphSize = "sm" | "md";

export type PrGlyphProps = {
	state: PrGlyphState;
	isDraft: boolean;
	size?: PrGlyphSize;
};

type OcticonProps = { size?: number; className?: string; "aria-hidden"?: "true" };

type Look = { label: string; tone: string; Icon: ComponentType<OcticonProps> };

// GitHub draws one shape and one color per pull request state, and a person
// who reads GitHub every day already knows them. Trellis draws the same four.
const looks = {
	open: { label: "Pull request open", tone: "text-success", Icon: GitPullRequestIcon },
	draft: { label: "Pull request draft", tone: "text-fg-muted", Icon: GitPullRequestDraftIcon },
	merged: { label: "Pull request merged", tone: "text-agent", Icon: GitMergeIcon },
	closed: { label: "Pull request closed", tone: "text-danger", Icon: GitPullRequestClosedIcon },
} as const satisfies Record<string, Look>;

type PrGlyphLook = keyof typeof looks;

// GitHub marks a merged or a closed pull request as merged or closed, and it
// marks the draft only while the pull request is open.
const lookOf = (state: PrGlyphState, isDraft: boolean): PrGlyphLook => (state === "open" && isDraft ? "draft" : state);

// A table row is 32 px tall and holds the small glyph. A pull request row has
// more room and holds the medium one.
const boxes: Record<PrGlyphSize, string> = { sm: "size-4", md: "size-5" };
const marks: Record<PrGlyphSize, { className: string; pixels: number }> = {
	sm: { className: "size-3.5", pixels: 14 },
	md: { className: "size-4", pixels: 16 },
};

export const prGlyphLabel = (state: PrGlyphState, isDraft: boolean) => looks[lookOf(state, isDraft)].label;

// The state of one pull request as one glyph. The glyph reads no check
// result: a check that fails leaves an open pull request open, and the check
// result is drawn beside the glyph by its own element.
export function PrGlyph({ state, isDraft, size = "md" }: PrGlyphProps) {
	const key = lookOf(state, isDraft);
	const { label, tone, Icon } = looks[key];
	const mark = marks[size];
	return (
		<span
			data-pr-glyph={key}
			title={label}
			className={cx("relative inline-flex shrink-0 items-center justify-center", boxes[size], tone)}
		>
			<Icon size={mark.pixels} className={cx("shrink-0", mark.className)} aria-hidden="true" />
			<span className="sr-only">{label}</span>
		</span>
	);
}
