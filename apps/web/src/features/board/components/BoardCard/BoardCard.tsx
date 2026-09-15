import type { TicketSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { type KeyboardEvent, useCallback, useRef } from "react";
import { useArchivedProjects } from "../../../../hooks/useArchivedProjects";
import { useCardDnd } from "../../hooks/useBoardDnd";
import { CardContent } from "../CardContent";
import { DragIndicator } from "../DragIndicator";

export type BoardCardProps = {
	ticket: TicketSummary;
	index: number;
	columnId: string;
	columnName: string;
	columnCount: number;
	onOpen: () => void;
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
	onOpen,
	onFocus,
	onKeyDown,
	announce,
	showStatus = false,
	dropBefore = false,
}: BoardCardProps) {
	const ref = useRef<HTMLLIElement>(null);
	const pickup = useCallback((message: string) => announce(message), [announce]);
	const readOnly = useArchivedProjects().isArchived(ticket.project.path);
	const { dragging } = useCardDnd(
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
		{ ticket, showStatus },
		readOnly,
	);

	return (
		<li
			ref={ref}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: A focused ticket list item receives the board keyboard shortcuts.
			tabIndex={0}
			aria-label={`${ticket.identifier} ${ticket.title}`}
			data-card=""
			data-ticket-id={ticket.id}
			data-dragging={dragging ? "true" : undefined}
			onClick={onOpen}
			onFocus={onFocus}
			onKeyDown={onKeyDown}
			className={cx(
				"relative flex min-h-19 shrink-0 cursor-grab flex-col gap-1.5 rounded-md border bg-surface p-3 text-base shadow-none transition-[box-shadow,border-color] duration-hover ease-out hover:shadow-sm active:cursor-grabbing",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
				dragging ? "border-dashed border-border-strong opacity-40" : "border-border",
			)}
		>
			{dropBefore && <DragIndicator />}
			<CardContent ticket={ticket} showStatus={showStatus} />
		</li>
	);
}
