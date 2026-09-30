import { ArrowClockwise, ArrowUp } from "@phosphor-icons/react";
import { useLayoutEffect, useRef } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Spinner } from "../../primitives/Spinner";
import { Switch } from "../../primitives/Switch";
import { Tooltip } from "../../primitives/Tooltip";

export type ChatterMessage = {
	id: string;
	senderId: string;
	senderName: string;
	recipientId: string;
	recipientName: string;
	text: string;
	state: "pending" | "sent" | "queued" | "skipped" | "unconfirmed";
	createdAt: string;
};

export type ChatterPanelProps = {
	epicName: string;
	enabled: boolean | undefined;
	onEnabledChange: (enabled: boolean) => void;
	saving: boolean;
	readOnly: boolean;
	messages: readonly ChatterMessage[];
	loading: boolean;
	error: string | null;
	onRetry: () => void;
	hasEarlier: boolean;
	loadingEarlier: boolean;
	onLoadEarlier: () => void;
};

const stateText = {
	pending: "Sending",
	sent: "Sent",
	queued: "Queued",
	skipped: "Skipped",
	unconfirmed: "Unconfirmed",
};
const clock = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
});

export function ChatterPanel({
	epicName,
	enabled,
	onEnabledChange,
	saving,
	readOnly,
	messages,
	loading,
	error,
	onRetry,
	hasEarlier,
	loadingEarlier,
	onLoadEarlier,
}: ChatterPanelProps) {
	const scroll = useRef<HTMLDivElement>(null);
	const pinned = useRef(true);
	const previous = useRef<{ first: string | undefined; height: number }>({ first: undefined, height: 0 });
	useLayoutEffect(() => {
		const element = scroll.current!;
		const first = messages[0]?.id;
		if (previous.current.first && first && first < previous.current.first)
			element.scrollTop += element.scrollHeight - previous.current.height;
		else if (pinned.current) element.scrollTop = element.scrollHeight;
		previous.current = { first, height: element.scrollHeight };
	}, [messages]);
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 flex-col gap-3 border-b border-border p-4">
				<p className="truncate text-sm text-fg-muted" title={epicName}>
					{epicName}
				</p>
				<Switch
					label="Chatter"
					checked={enabled === true}
					disabled={enabled === undefined || saving || readOnly}
					onCheckedChange={onEnabledChange}
				/>
				<p className="text-sm text-fg-muted">
					{enabled === undefined
						? "Loading Chatter settings…"
						: enabled
							? "Agents can send messages to and from this epic."
							: "Agent messages to and from this epic are off. Your messages and system notices still arrive."}
				</p>
			</div>
			{error && (
				<div role="alert" className="flex items-center gap-2 border-b border-border p-4 text-sm text-danger">
					<p className="min-w-0 flex-1 break-words">{error}</p>
					<Tooltip content="Reload Chatter">
						<IconButton label="Reload Chatter" icon={<ArrowClockwise />} onClick={onRetry} />
					</Tooltip>
				</div>
			)}
			<div
				ref={scroll}
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
				onScroll={() => {
					const element = scroll.current!;
					pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 4;
				}}
			>
				{hasEarlier && (
					<div className="mb-4 flex items-center justify-center gap-2 text-sm text-fg-muted">
						<Tooltip content="Load earlier messages">
							<IconButton
								label="Load earlier messages"
								icon={<ArrowUp />}
								disabled={loadingEarlier}
								onClick={onLoadEarlier}
							/>
						</Tooltip>
						<span>{loadingEarlier ? "Loading earlier messages…" : "Earlier messages"}</span>
					</div>
				)}
				{loading ? (
					<div role="status" className="flex items-center gap-2 text-sm text-fg-muted">
						<Spinner />
						Loading messages…
					</div>
				) : messages.length === 0 && !error ? (
					<div className="py-8 text-center text-sm text-fg-muted">
						<p className="font-medium text-fg">No messages yet</p>
						<p className="mt-2">Messages appear here when agents communicate.</p>
					</div>
				) : null}
				<ol aria-label="Agent messages" className="flex flex-col gap-4 font-mono text-sm">
					{messages.map((message) => (
						<li key={message.id} className="min-w-0">
							<div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
								<time
									dateTime={message.createdAt}
									title={new Date(message.createdAt).toLocaleString()}
									className="tabular-nums text-fg-muted"
								>
									{clock.format(new Date(message.createdAt))}
								</time>
								<span className="break-all font-medium text-fg" title={message.senderId}>
									{message.senderName}
								</span>
								<span className="text-fg-muted">to</span>
								<span className="break-all text-fg-muted" title={message.recipientId}>
									{message.recipientName}
								</span>
								<span className={message.state === "unconfirmed" ? "text-warning" : "text-fg-muted"}>
									{stateText[message.state]}
								</span>
							</div>
							<p className="whitespace-pre-wrap break-words text-fg [overflow-wrap:anywhere]">{message.text}</p>
						</li>
					))}
				</ol>
			</div>
		</div>
	);
}
