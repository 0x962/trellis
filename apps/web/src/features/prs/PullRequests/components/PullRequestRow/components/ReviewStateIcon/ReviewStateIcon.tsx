import type { ReviewState } from "@trellis/api";
import { cx } from "@trellis/ui";
import { CheckCheck, Circle, X } from "lucide-react";
import type { ComponentType } from "react";

export type ReviewStateIconProps = {
	reviewState: ReviewState;
	isDraft: boolean;
};

type Look = { label: string; tone: string; Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }> };

const looks: Record<"approved" | "waiting" | "changes" | "idle", Look> = {
	approved: { label: "Approved", tone: "text-success", Icon: CheckCheck },
	waiting: { label: "Review requested", tone: "text-warning", Icon: Circle },
	changes: { label: "Changes requested", tone: "text-danger", Icon: X },
	idle: { label: "No review requested", tone: "text-fg-muted", Icon: Circle },
};

const keys: Record<ReviewState, "approved" | "waiting" | "changes" | "idle"> = {
	approved: "approved",
	review_required: "waiting",
	changes_requested: "changes",
	none: "idle",
};

// The review state of one pull request as one icon. A draft draws the idle
// icon whatever gh reports, because a draft accepts no review. Every state
// draws an icon, so a row with a review is the same width as a row without
// one. The color carries the state and the sr-only text names it, so color
// is never the only signal.
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
