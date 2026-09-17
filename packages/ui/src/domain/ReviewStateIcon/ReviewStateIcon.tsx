import { Checks, Circle, X } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { cx } from "../../utils/cx";

export type PullRequestReviewState = "none" | "review_required" | "approved" | "changes_requested";

export type ReviewStateIconProps = {
	reviewState: PullRequestReviewState;
	isDraft: boolean;
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

export const reviewStateLabel = (reviewState: PullRequestReviewState, isDraft: boolean) =>
	looks[isDraft ? "idle" : keys[reviewState]].label;

// The review state of one pull request uses a distinct icon and color. A
// draft uses the idle icon because it does not accept a review.
export function ReviewStateIcon({ reviewState, isDraft }: ReviewStateIconProps) {
	const key = isDraft ? "idle" : keys[reviewState];
	const { label, tone, Icon } = looks[key];
	return (
		<span
			data-review-state={key}
			title={label}
			className={cx("relative inline-flex size-5 shrink-0 items-center justify-center", tone)}
		>
			<Icon className="size-4" aria-hidden={true} />
			<span className="sr-only">{label}</span>
		</span>
	);
}
