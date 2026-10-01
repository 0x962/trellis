import type { ChatterMessage } from "../../ChatterPanel";

const stateText = {
	pending: "Sending",
	sent: "Sent",
	queued: "Queued",
	skipped: "Skipped",
	unconfirmed: "Delivery unconfirmed",
};
const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
const day = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export function ChatterMessageRow({ message, showDate }: { message: ChatterMessage; showDate: boolean }) {
	const date = new Date(message.createdAt);
	return (
		<li className="min-w-0">
			{showDate && <p className="px-4 py-2 text-xs text-fg-faint sm:px-5">{day.format(date)}</p>}
			<div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 px-4 py-2 hover:bg-band-translucent sm:gap-x-3 sm:px-5">
				<time
					dateTime={message.createdAt}
					title={date.toLocaleString()}
					className="pt-0.5 font-mono text-xs tabular-nums text-fg-faint"
				>
					{clock.format(date)}
				</time>
				<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-sm leading-normal [overflow-wrap:anywhere]">
					<span className="min-w-0 font-medium text-fg" title={message.senderId}>
						{message.senderName}
					</span>
					<span className="text-fg-faint">
						<span aria-hidden="true">→</span>
						<span className="sr-only">to</span>
					</span>
					<span className="min-w-0 text-fg-muted" title={message.recipientId}>
						{message.recipientName}
					</span>
				</div>
				<p className="col-start-2 whitespace-pre-wrap font-sans text-base text-fg [overflow-wrap:anywhere]">
					{message.text}
				</p>
				{message.state === "sent" ? (
					<span className="sr-only">Sent</span>
				) : (
					<p
						className={`col-start-2 mt-1 text-xs ${message.state === "unconfirmed" || message.state === "skipped" ? "text-warning" : "text-fg-muted"}`}
					>
						{stateText[message.state]}
					</p>
				)}
			</div>
		</li>
	);
}
