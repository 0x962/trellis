import { cx } from "@trellis/ui";
import type { LiveStatus } from "../../../../../lib/live";

export type ConnectionDotProps = {
	status: LiveStatus;
};

const looks: Record<LiveStatus, { label: string; color: string }> = {
	connecting: { label: "Connecting", color: "bg-fg-faint" },
	live: { label: "Online", color: "bg-success" },
	reconnecting: { label: "Reconnecting", color: "bg-warning" },
	restarting: { label: "Reconnecting", color: "bg-warning" },
	down: { label: "Offline", color: "bg-danger" },
};

// The 7 px dot in the workspace row. Its label names the state, so the
// color is never the only signal.
export function ConnectionDot({ status }: ConnectionDotProps) {
	const look = looks[status];
	return (
		<span
			role="img"
			aria-label={look.label}
			title={look.label}
			className={cx("inline-block size-1.75 shrink-0 rounded-sm transition-colors duration-hover", look.color)}
		/>
	);
}
