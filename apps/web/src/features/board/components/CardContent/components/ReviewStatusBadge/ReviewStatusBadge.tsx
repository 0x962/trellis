import { CheckCircle, CircleDashed, XCircle } from "@phosphor-icons/react";
import type { ReviewState } from "@trellis/api";
import { Badge, type BadgeTone } from "@trellis/ui";
import type { ReactElement } from "react";

export type ReviewStatusBadgeProps = {
	reviewState: ReviewState | null;
};

type Look = {
	label: string;
	tone: BadgeTone;
	icon: ReactElement;
};

const looks: Record<ReviewState, Look> = {
	none: { label: "In progress", tone: "wait", icon: <CircleDashed weight="duotone" /> },
	review_required: { label: "In progress", tone: "wait", icon: <CircleDashed weight="duotone" /> },
	changes_requested: { label: "Changes requested", tone: "bad", icon: <XCircle /> },
	approved: { label: "Approved", tone: "ok", icon: <CheckCircle weight="fill" /> },
};

export function ReviewStatusBadge({ reviewState }: ReviewStatusBadgeProps) {
	const look = looks[reviewState ?? "none"];
	return (
		<Badge tone={look.tone} size="sm" icon={look.icon}>
			{look.label}
		</Badge>
	);
}
