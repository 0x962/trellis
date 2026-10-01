import { ArrowClockwise, ArrowUp } from "@phosphor-icons/react";
import { useLayoutEffect, useRef } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Spinner } from "../../primitives/Spinner";
import { Switch } from "../../primitives/Switch";
import { Tooltip } from "../../primitives/Tooltip";
import { FailureState } from "../FailureState";
import { ChatterMessageRow } from "./components/ChatterMessageRow";

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
	const scroll = useRef<HTMLElement>(null);
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
			<div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
				<div className="flex min-h-7 items-center justify-between gap-4">
					<p className="min-w-0 truncate text-sm font-medium" title={epicName}>
						{epicName}
					</p>
					<Switch
						label="Chatter"
						className="shrink-0 [&_label]:sr-only"
						checked={enabled === true}
						disabled={enabled === undefined || saving || readOnly}
						onCheckedChange={onEnabledChange}
					/>
				</div>
				<p className="mt-0.5 text-xs text-fg-muted">
					{enabled === undefined
						? "Loading settings…"
						: enabled
							? "Agent messages to and from this epic."
							: "Chatter is off. Your messages and system notices still arrive."}
				</p>
			</div>
			{error && (
				<div role="alert" className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
					<FailureState
						title="Chatter is unavailable"
						detail={error}
						recovery="none"
						variant="section"
						action={
							<Tooltip content="Reload Chatter">
								<IconButton label="Reload Chatter" icon={<ArrowClockwise />} onClick={onRetry} />
							</Tooltip>
						}
					/>
				</div>
			)}
			<section
				ref={scroll}
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
				aria-label="Chatter history"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need focus in Chatter history to scroll through messages.
				tabIndex={0}
				onScroll={() => {
					const element = scroll.current!;
					pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 4;
				}}
			>
				{hasEarlier && (
					<div className="mb-3 flex items-center justify-center gap-1 text-xs text-fg-muted">
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
					<div role="status" className="flex items-center gap-2 px-4 py-3 text-sm text-fg-muted sm:px-5">
						<Spinner />
						Loading messages…
					</div>
				) : messages.length === 0 && !error ? (
					<div className="px-4 py-6 sm:px-5">
						<EmptyState
							title="No messages yet"
							description="Agent messages appear here when Chatter is on."
							image={null}
						/>
					</div>
				) : null}
				<ol aria-label="Agent messages">
					{messages.map((message, index) => (
						<ChatterMessageRow
							key={message.id}
							message={message}
							showDate={
								index === 0 ||
								new Date(message.createdAt).toDateString() !== new Date(messages[index - 1]!.createdAt).toDateString()
							}
						/>
					))}
				</ol>
			</section>
		</div>
	);
}
