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

type Message = { text: string; tone: string; pulse: boolean };

const messages: Partial<Record<LiveStatus, Message>> = {
	reconnecting: { text: "Reconnecting to the server…", tone: "bg-warning-soft text-warning", pulse: true },
	restarting: { text: "Server restarting", tone: "bg-warning-soft text-warning", pulse: true },
	down: {
		text: "The server is offline. Start it with trellis serve.",
		tone: "bg-danger-soft text-danger",
		pulse: false,
	},
};

// A pill over the top center of the pane while the connection is not live.
// It floats over the page, so the page never moves when the state changes.
// The text carries the state, so the sidebar dot's color is never the only
// signal. A return to live after an outage shows "Reconnected" for two
// seconds.
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

	const message: Message | null = reconnected
		? { text: "Reconnected", tone: "bg-success-soft text-success", pulse: false }
		: (messages[status] ?? null);
	if (message === null) return null;
	return (
		<div
			role="status"
			className={cx(
				"absolute top-2.5 left-1/2 z-20 flex h-6 -translate-x-1/2 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium whitespace-nowrap shadow-sm",
				message.tone,
			)}
		>
			{message.pulse && (
				<span data-pulse="" aria-hidden="true" className="size-1.5 rounded-sm bg-current animate-pulse-live" />
			)}
			{message.text}
		</div>
	);
}
