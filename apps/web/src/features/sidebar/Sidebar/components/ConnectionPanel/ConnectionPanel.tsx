import { ArrowsClockwise, DotsThreeCircle, Power, WifiSlash } from "@phosphor-icons/react";
import { cx, Popover } from "@trellis/ui";
import type { ReactElement } from "react";
import type { LiveStatus } from "../../../../../lib/live";

export type ConnectionPanelProps = {
	status: LiveStatus;
	collapsed?: boolean;
};

// What the browser says about its connection to the trellis server. A live
// connection says nothing, because a healthy server is the normal case and
// a line for it is noise. Every other state names itself and what it means.
const looks: Partial<
	Record<LiveStatus, { label: string; detail: string; dot: string; iconTone: string; icon: ReactElement }>
> = {
	connecting: {
		label: "Connecting",
		detail: "Reaching the server.",
		dot: "bg-fg-faint",
		iconTone: "text-fg-faint",
		icon: <DotsThreeCircle />,
	},
	reconnecting: {
		label: "Reconnecting",
		detail: "The connection dropped.",
		dot: "bg-warning",
		iconTone: "text-warning",
		icon: <ArrowsClockwise />,
	},
	restarting: {
		label: "Restarting",
		detail: "The server is coming back.",
		dot: "bg-warning",
		iconTone: "text-warning",
		icon: <Power />,
	},
	down: {
		label: "Server offline",
		detail: "Nothing answers on the server.",
		dot: "bg-danger",
		iconTone: "text-danger",
		icon: <WifiSlash />,
	},
};

// The panel above the sidebar footer. It renders nothing while the
// connection is live, so the footer keeps the bottom to itself.
export function ConnectionPanel({ status, collapsed = false }: ConnectionPanelProps) {
	const look = looks[status];
	if (look === undefined) return null;
	if (collapsed) {
		return (
			<div className="mb-0.5 flex justify-center">
				<span role="status" aria-live="polite" className="sr-only">
					{look.label}. {look.detail}
				</span>
				<Popover
					trigger={
						<button
							type="button"
							aria-label={`Server connection: ${look.label}. ${look.detail}`}
							className={cx("sidebar-rail-row", look.iconTone)}
						>
							<span aria-hidden="true" className="inline-flex size-4 *:size-full">
								{look.icon}
							</span>
						</button>
					}
					triggerTooltip={`${look.label}. ${look.detail}`}
					label="Server connection details"
					side="right"
					align="end"
				>
					<div role="status" className="flex items-start gap-2">
						<span className={cx("mt-1.25 inline-block size-1.75 shrink-0 rounded-sm", look.dot)} />
						<span className="min-w-0">
							<span className="block text-sm text-fg">{look.label}</span>
							<span className="block text-xs text-fg-muted">{look.detail}</span>
						</span>
					</div>
				</Popover>
			</div>
		);
	}

	return (
		<div
			role="status"
			aria-label="Server connection"
			className="mb-2 flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5"
		>
			<span className={cx("mt-1.25 inline-block size-1.75 shrink-0 rounded-sm", look.dot)} />
			<span className="min-w-0">
				<span className="block text-sm text-fg">{look.label}</span>
				<span className="block text-xs text-fg-muted">{look.detail}</span>
			</span>
		</div>
	);
}
