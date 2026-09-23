import { Checks, Circle, X } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";

export type PullRequestReviewState = "none" | "review_required" | "approved" | "changes_requested";

export type ReviewStateIconProps = {
	reviewState: PullRequestReviewState;
	// True while the agent has not asked for review. GitHub takes no review
	// then, so the mark draws the idle look whatever the review state says.
	notReady: boolean;
	tooltip?: boolean;
	focusable?: boolean;
	// The words for this mark, in place of the GitHub review state words.
	// The local verdict of the person who looks at the screen needs its own
	// words: the mark then says what that person did, not what GitHub asks
	// of a reviewer.
	label?: string;
};

type Look = { label: string; tone: string; Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }> };

const looks = {
	approved: { label: "Approved", tone: "text-success", Icon: Checks },
	waiting: { label: "Review requested", tone: "text-warning", Icon: Circle },
	changes: { label: "Changes requested", tone: "text-danger", Icon: X },
	idle: { label: "No review requested", tone: "text-fg-muted", Icon: Circle },
} as const satisfies Record<"approved" | "waiting" | "changes" | "idle", Look>;

const keys: Record<PullRequestReviewState, keyof typeof looks> = {
	approved: "approved",
	review_required: "waiting",
	changes_requested: "changes",
	none: "idle",
};

export const reviewStateLabel = (reviewState: PullRequestReviewState, notReady: boolean) =>
	looks[notReady ? "idle" : keys[reviewState]].label;

// The review state of one pull request uses a distinct icon and color. A
// pull request whose agent has not asked for review uses the idle icon,
// because it takes no review. The accessible name and the tooltip say the
// same words.
export function ReviewStateIcon({
	reviewState,
	notReady,
	tooltip = true,
	focusable = true,
	label,
}: ReviewStateIconProps) {
	const key = notReady ? "idle" : keys[reviewState];
	const { tone, Icon } = looks[key];
	const words = label ?? looks[key].label;
	const icon = (
		<span
			data-review-state={key}
			role="img"
			aria-label={words}
			tabIndex={tooltip && focusable ? 0 : undefined}
			className={cx("relative inline-flex size-5 shrink-0 items-center justify-center", tone)}
		>
			<Icon className="size-4" aria-hidden={true} />
		</span>
	);
	return tooltip ? <Tooltip content={words}>{icon}</Tooltip> : icon;
}
