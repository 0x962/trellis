import type { TicketSummary } from "@trellis/api";
import { Avatar, CheckRibbon, PriorityIcon, StatusIcon, TicketId } from "@trellis/ui";
import { GitPullRequest, Paperclip } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef } from "react";
import { compactRelativeTime } from "../../../../lib/format";
import { useCardDnd } from "../../hooks/useBoardDnd";
import { DragIndicator } from "../DragIndicator";

export type BoardCardProps = {
	ticket: TicketSummary;
	index: number;
	columnName: string;
	columnCount: number;
	onOpen: () => void;
	onFocus: () => void;
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
	announce: (message: string) => void;
	showStatus?: boolean;
};

const checksFor = (ticket: TicketSummary) => {
	const pr = ticket.pr;
	if (pr === null) return [];
	return [
		...Array.from({ length: pr.pass }, (_, index) => ({ name: `Pass ${index + 1}`, bucket: "pass" as const })),
		...Array.from({ length: pr.fail }, (_, index) => ({ name: `Fail ${index + 1}`, bucket: "fail" as const })),
		...Array.from({ length: pr.pending }, (_, index) => ({ name: `Pending ${index + 1}`, bucket: "pending" as const })),
	];
};

export function BoardCard({
	ticket,
	index,
	columnName,
	columnCount,
	onOpen,
	onFocus,
	onKeyDown,
	announce,
	showStatus = false,
}: BoardCardProps) {
	const ref = useRef<HTMLLIElement>(null);
	const pickup = useCallback((message: string) => announce(message), [announce]);
	const edge = useCardDnd(
		ref,
		{
			ticketId: ticket.id,
			statusId: ticket.status.id,
			identifier: ticket.identifier,
			title: ticket.title,
			index,
			columnName,
			columnCount,
		},
		pickup,
	);
	const failing = ticket.pr?.state === "open" && ticket.pr.ciState === "fail";
	const progress = ticket.childCount === 0 ? 0 : ticket.childDoneCount / ticket.childCount;

	return (
		<li
			ref={ref}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: A focused ticket list item receives the board keyboard shortcuts.
			tabIndex={0}
			aria-label={`${ticket.identifier} ${ticket.title}`}
			data-card=""
			data-ticket-id={ticket.id}
			data-ci={failing ? "failing" : undefined}
			onClick={onOpen}
			onFocus={onFocus}
			onKeyDown={onKeyDown}
			className={`relative flex h-24 shrink-0 cursor-grab flex-col rounded-md border border-border bg-surface p-3 text-base shadow-none transition-[box-shadow,border-color] duration-hover ease-out hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${failing ? "border-t-2 border-t-danger" : ""}`}
		>
			{edge === "top" && <DragIndicator />}
			<div className="flex items-center justify-between">
				<TicketId id={ticket.identifier} size="sm" />
				{ticket.priority !== "none" && <PriorityIcon priority={ticket.priority} />}
			</div>
			<p className="mt-1 line-clamp-2 min-h-10 text-base font-medium text-fg">{ticket.title}</p>
			<div className="mt-auto flex min-w-0 items-center gap-1.5 text-xs text-fg-faint tabular">
				{ticket.pr !== null && (
					<>
						<GitPullRequest aria-label={`${ticket.pr.state} pull request`} className="size-3.25 shrink-0" />
						<CheckRibbon checks={checksFor(ticket)} size="mini" />
					</>
				)}
				{ticket.childCount > 0 && (
					<span className="inline-flex items-center gap-1">
						<StatusIcon category="started" progress={progress} label="Sub-ticket progress" />
						{ticket.childDoneCount}/{ticket.childCount}
					</span>
				)}
				{ticket.attachmentCount > 0 && (
					<span className="inline-flex items-center gap-1">
						<Paperclip aria-hidden="true" className="size-3" />
						{ticket.attachmentCount}
					</span>
				)}
				{showStatus && <span className="truncate">{ticket.status.name}</span>}
				{ticket.lastActor !== null && ticket.lastActor.kind !== "system" && (
					<span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
						<Avatar kind={ticket.lastActor.kind} name={ticket.lastActor.name} />
						{compactRelativeTime(ticket.lastActor.at)}
					</span>
				)}
			</div>
			{edge === "bottom" && <span className="absolute inset-x-0 -bottom-0.25 z-10 h-0.5 bg-accent" />}
		</li>
	);
}
