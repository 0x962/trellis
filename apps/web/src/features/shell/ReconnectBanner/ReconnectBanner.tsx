import type { Scheduler } from "@trellis/api";
import { cx } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import type { Live, LiveStatus } from "../../../lib/live";
import { useLiveStatus } from "../../../lib/liveStatus";

export type ReconnectBannerProps = {
	live: Live;
	scheduler: Scheduler;
};

// How long "Reconnected" stays up.
export const reconnectedBannerMs = 2000;

const messages: Partial<Record<LiveStatus, { text: string; tone: string }>> = {
	reconnecting: { text: "Reconnecting to trellis…", tone: "bg-warning-soft text-warning" },
	restarting: { text: "Server restarting", tone: "bg-warning-soft text-warning" },
	down: { text: "trellis is unreachable", tone: "bg-danger-soft text-danger" },
};

// A thin bar over the page while the connection is not live. The text
// carries the state, so the sidebar dot's color is never the only signal.
// A return to live after an outage shows "Reconnected" for two seconds.
export function ReconnectBanner({ live, scheduler }: ReconnectBannerProps) {
	const status = useLiveStatus(live);
	const [reconnected, setReconnected] = useState(false);
	const previous = useRef<LiveStatus>(status);

	useEffect(() => {
		const before = previous.current;
		previous.current = status;
		if (status !== "live" || before === "live" || before === "connecting") return;
		setReconnected(true);
		const handle = scheduler.setTimeout(() => setReconnected(false), reconnectedBannerMs);
		return () => scheduler.clearTimeout(handle);
	}, [status, scheduler]);

	const message = reconnected
		? { text: "Reconnected", tone: "bg-success-soft text-success" }
		: (messages[status] ?? null);
	if (message === null) return null;
	return (
		<div
			role="status"
			className={cx("flex h-7 shrink-0 items-center justify-center text-sm font-medium", message.tone)}
		>
			{message.text}
		</div>
	);
}
