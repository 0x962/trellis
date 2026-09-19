import { cx } from "../../utils/cx";
import type { CheckStatus } from "../checkStatus";
import { type CheckRingCounts, ringSegments } from "./segments";

export type CheckRingProps = {
	counts: CheckRingCounts;
	label?: string;
	className?: string;
};

const colors: Record<CheckStatus, string> = {
	failed: "text-danger",
	running: "text-warning",
	pending: "text-warning",
	canceled: "text-fg-muted",
	unknown: "text-fg-muted",
	neutral: "text-fg-muted",
	skipped: "text-fg-muted",
	success: "text-success",
};

export function CheckRing({ counts, label, className }: CheckRingProps) {
	const segments = ringSegments(counts);
	if (segments.length === 0) return null;
	return (
		<svg
			viewBox="0 0 36 36"
			fill="none"
			role={label ? "img" : undefined}
			aria-label={label}
			aria-hidden={label ? undefined : true}
			className={cx("size-9 shrink-0", className)}
		>
			{segments.map((segment) => (
				<circle
					key={segment.status}
					data-status={segment.status}
					cx="18"
					cy="18"
					r="15"
					pathLength="100"
					stroke="currentColor"
					strokeWidth="3.5"
					strokeLinecap="round"
					strokeDasharray={`${segment.length} ${100 - segment.length}`}
					strokeDashoffset={-segment.start}
					transform="rotate(-90 18 18)"
					className={colors[segment.status]}
				/>
			))}
		</svg>
	);
}
