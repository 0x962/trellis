import { cx } from "@trellis/ui";
import type { LiveStatus } from "../../../../../lib/live";

export type ConnectionPanelProps = {
	status: LiveStatus;
};

// What the browser says about its connection to the trellis server. A live
// connection says nothing, because a healthy server is the normal case and
// a line for it is noise. Every other state names itself and what it means.
const looks: Partial<Record<LiveStatus, { label: string; detail: string; dot: string }>> = {
	connecting: { label: "Connecting", detail: "Reaching the server.", dot: "bg-fg-faint" },
	reconnecting: { label: "Reconnecting", detail: "The connection dropped.", dot: "bg-warning" },
	restarting: { label: "Restarting", detail: "The server is coming back.", dot: "bg-warning" },
	down: { label: "Server offline", detail: "Nothing answers on the server.", dot: "bg-danger" },
};

// The panel above the sidebar footer. It renders nothing while the
// connection is live, so the footer keeps the bottom to itself.
export function ConnectionPanel({ status }: ConnectionPanelProps) {
	const look = looks[status];
	if (look === undefined) return null;

	return (
		<div
			role="status"
			aria-label="Server connection"
			className="mb-2 flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5"
		>
			<span className={cx("mt-1.25 inline-block size-1.75 shrink-0 rounded-full", look.dot)} />
			<span className="min-w-0">
				<span className="block text-sm text-fg">{look.label}</span>
				<span className="block text-xs text-fg-muted">{look.detail}</span>
			</span>
		</div>
	);
}
