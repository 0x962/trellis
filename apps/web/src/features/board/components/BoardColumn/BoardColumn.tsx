import { CaretRight } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { Button, cx, GroupHeader, IconButton, StatusIcon, Tooltip, useMediaQuery } from "@trellis/ui";
import { type KeyboardEvent, type MouseEvent, useCallback, useId, useLayoutEffect, useMemo, useRef } from "react";
import { workingGroupInsertIndex } from "../../columns";
import { useBoardAutoScroll, useColumnDnd } from "../../hooks/useBoardDnd";
import type { BoardColumnModel } from "../../types";
import { visibleCards } from "../../utils/visibleCards";
import { BoardCard } from "../BoardCard";
import { DragIndicator } from "../DragIndicator";

export type BoardColumnProps = {
	column: BoardColumnModel;
	collapsed: boolean;
	showAllDone: boolean;
	hasMore: boolean;
	loadingMore: boolean;
	categoryMode: boolean;
	// The CSS width of an open column. The board computes it, so every open
	// column has the same width.
	width: string;
	// True in the light theme: the column is a grey well that holds white cards.
	well: boolean;
	workingTicketIds: ReadonlySet<string>;
	// True while cards are selected. The card list then keeps room under the
	// last card for the bulk bar.
	bottomRoom: boolean;
	isSelected: (ticketId: string) => boolean;
	onToggle: () => void;
	onShowAllDone: () => void;
	onShowMore: () => Promise<void>;
	onFocusTicket: (identifier: string) => void;
	onCardClick: (event: MouseEvent<HTMLElement>, column: BoardColumnModel, ticket: TicketSummary) => void;
	onCardKeyDown: (event: KeyboardEvent<HTMLElement>, column: BoardColumnModel, ticket: TicketSummary) => void;
	onAnnounce: (message: string) => void;
};

// The header stays outside the card list so its disclosure remains reachable during vertical scroll.
export function BoardColumn({
	column,
	collapsed,
	showAllDone,
	hasMore,
	loadingMore,
	categoryMode,
	width,
	well,
	workingTicketIds,
	bottomRoom,
	isSelected,
	onToggle,
	onShowAllDone,
	onShowMore,
	onFocusTicket,
	onCardClick,
	onCardKeyDown,
	onAnnounce,
}: BoardColumnProps) {
	const target = useRef<HTMLElement>(null);
	const list = useRef<HTMLUListElement>(null);
	const controls = useId();
	const heading = useId();
	const focusAfterToggle = useRef(false);
	const phone = useMediaQuery("(max-width: 767px)");
	const toggle = () => {
		focusAfterToggle.current = true;
		onToggle();
	};
	useLayoutEffect(() => {
		if (!focusAfterToggle.current) return;
		focusAfterToggle.current = false;
		const control = target.current!.querySelector<HTMLButtonElement>(collapsed ? "button" : "button[aria-expanded]")!;
		control.focus({ preventScroll: true });
		control.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
	}, [collapsed]);
	const expand = useCallback(() => {
		if (collapsed) onToggle();
	}, [collapsed, onToggle]);
	const over = useColumnDnd(target, column, collapsed, expand);
	useBoardAutoScroll(list, !collapsed);
	const open = useMemo(() => visibleCards(column, { collapsed: false, showAllDone }), [column, showAllDone]);
	const visible = useMemo(() => (collapsed ? [] : open), [collapsed, open]);
	const count = column.count;
	const dropIndex = useMemo(
		() =>
			over === null
				? null
				: workingGroupInsertIndex(visible, { id: over.ticketId, createdAt: over.createdAt }, workingTicketIds),
		[visible, over, workingTicketIds],
	);

	if (collapsed) {
		return (
			<ul
				ref={(element) => {
					target.current = element;
				}}
				aria-label={`${column.name}, ${count} tickets`}
				data-category={column.category}
				className={cx(
					"flex w-10 shrink-0 snap-start flex-col items-center rounded-lg border bg-surface py-2 transition-colors duration-hover",
					over !== null ? "border-accent" : "border-border",
				)}
			>
				<li role="none" className="contents">
					<Tooltip content={`Expand ${column.name}`}>
						<IconButton label={`Expand ${column.name}`} icon={<CaretRight />} size="xs" onClick={toggle} />
					</Tooltip>
					<StatusIcon category={column.category} />
					<span className="mt-2 [writing-mode:vertical-rl] text-sm font-medium text-fg-muted">
						{column.name} <span className="tabular">{count}</span>
					</span>
				</li>
			</ul>
		);
	}

	return (
		<section
			ref={target}
			aria-labelledby={heading}
			data-category={column.category}
			style={{ width }}
			className={cx("flex min-h-0 shrink-0 snap-start flex-col rounded-lg", well && "bg-band")}
		>
			<header className="shrink-0">
				<h2 id={heading} className="sr-only">
					{column.name}
				</h2>
				<GroupHeader
					group={column.id}
					label={column.name}
					count={count}
					icon={<StatusIcon category={column.category} />}
					expanded
					controls={controls}
					layout="section"
					phone={phone}
					onToggle={toggle}
				/>
			</header>
			<ul
				id={controls}
				ref={list}
				aria-label={`${column.name}, ${count} tickets`}
				data-category={column.category}
				className={cx("flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1", bottomRoom && "pb-16")}
			>
				{dropIndex === 0 && visible.length === 0 && (
					<li role="none" className="relative h-0">
						<DragIndicator />
					</li>
				)}
				{visible.map((ticket, index) => (
					<BoardCard
						key={ticket.id}
						ticket={ticket}
						index={index}
						columnId={column.id}
						columnName={column.name}
						columnCount={visible.length}
						working={workingTicketIds.has(ticket.id)}
						selected={isSelected(ticket.id)}
						onClick={(event) => onCardClick(event, column, ticket)}
						onFocus={() => onFocusTicket(ticket.identifier)}
						onKeyDown={(event) => onCardKeyDown(event, column, ticket)}
						announce={onAnnounce}
						showStatus={categoryMode}
						dropBefore={dropIndex === index}
					/>
				))}
				{dropIndex === visible.length && visible.length > 0 && (
					<li role="none" className="relative h-0">
						<DragIndicator />
					</li>
				)}
				{hasMore && (column.category !== "done" || showAllDone) && (
					<li role="none" className="self-start">
						<Button
							variant="quiet"
							size="sm"
							disabled={loadingMore}
							aria-busy={loadingMore}
							onClick={() => void onShowMore()}
						>
							Show more
						</Button>
					</li>
				)}
				{column.category === "done" && !showAllDone && (
					<li role="none" className="self-start">
						<Button variant="quiet" size="sm" onClick={onShowAllDone}>
							Show all done tickets
						</Button>
					</li>
				)}
			</ul>
		</section>
	);
}
