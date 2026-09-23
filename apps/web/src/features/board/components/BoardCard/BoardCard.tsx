import type { TicketSummary } from "@trellis/api";
import { cx, TicketGlimmer } from "@trellis/ui";
import { type KeyboardEvent, type MouseEvent, useCallback, useContext, useRef } from "react";
import { createPortal } from "react-dom";
import { useArchivedProjects } from "../../../../hooks/useArchivedProjects";
import { BoardLineStatsContext } from "../../BoardLineStatsContext";
import { useCardDnd } from "../../hooks/useBoardDnd";
import { CardContent } from "../CardContent";
import { CardPreview } from "../CardPreview";
import { DragIndicator } from "../DragIndicator";

export type BoardCardProps = {
	ticket: TicketSummary;
	index: number;
	columnId: string;
	columnName: string;
	columnCount: number;
	working: boolean;
	// True while the card belongs to the board selection. The board's live
	// region announces the count, because a list item carries no
	// `aria-selected`.
	selected: boolean;
	// A plain click opens the ticket. A shift click and a cmd or ctrl click
	// change the selection.
	onClick: (event: MouseEvent<HTMLElement>) => void;
	onFocus: () => void;
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
	announce: (message: string) => void;
	showStatus?: boolean;
	// Draws the drop line above this card while a card from another column
	// hangs over this one's column.
	dropBefore?: boolean;
};

export function BoardCard({
	ticket,
	index,
	columnId,
	columnName,
	columnCount,
	working,
	selected,
	onClick,
	onFocus,
	onKeyDown,
	announce,
	showStatus = false,
	dropBefore = false,
}: BoardCardProps) {
	const lineStats = useContext(BoardLineStatsContext)!;
	const showLineStats = ticket.status.category === "started";
	const ref = useRef<HTMLLIElement>(null);
	const pickup = useCallback((message: string) => announce(message), [announce]);
	const readOnly = useArchivedProjects().isArchived(ticket.project.key);
	const { dragging, previewFrame, positionRef, surfaceRef } = useCardDnd(
		ref,
		{
			ticketId: ticket.id,
			columnId,
			identifier: ticket.identifier,
			title: ticket.title,
			index,
			columnName,
			columnCount,
		},
		pickup,
		readOnly,
	);

	return (
		<li
			ref={ref}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: A focused ticket list item receives the board keyboard shortcuts.
			tabIndex={0}
			aria-label={`${ticket.identifier} ${ticket.title}`}
			aria-description={working ? "Agent working" : undefined}
			data-card=""
			data-selected={selected ? "" : undefined}
			data-working={working || undefined}
			data-ticket-id={ticket.id}
			data-dragging={dragging ? "true" : undefined}
			onClick={onClick}
			onFocus={onFocus}
			onKeyDown={onKeyDown}
			className={cx(
				"relative flex min-h-19 shrink-0 cursor-grab flex-col gap-1.5 rounded-md border-x border-b bg-surface p-3 text-base shadow-none transition-[box-shadow,border-color] duration-hover ease-out hover:shadow-kanban-hover active:cursor-grabbing",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
				"data-selected:bg-accent-soft data-selected:ring-2 data-selected:ring-accent data-selected:ring-inset",
				dragging ? "border-dashed border-border-strong opacity-40" : "border-border",
			)}
		>
			<TicketGlimmer active={working} />
			{dropBefore && <DragIndicator />}
			<CardContent
				ticket={ticket}
				showStatus={showStatus}
				lineChanges={showLineStats ? (lineStats.values.get(ticket.id) ?? null) : undefined}
				lineChangesPending={showLineStats && lineStats.pendingIds.has(ticket.id)}
			/>
			{previewFrame !== null &&
				createPortal(
					<CardPreview
						ticket={ticket}
						frame={previewFrame}
						positionRef={positionRef}
						surfaceRef={surfaceRef}
						showStatus={showStatus}
						lineChanges={showLineStats ? (lineStats.values.get(ticket.id) ?? null) : undefined}
						lineChangesPending={showLineStats && lineStats.pendingIds.has(ticket.id)}
					/>,
					document.body,
				)}
		</li>
	);
}
