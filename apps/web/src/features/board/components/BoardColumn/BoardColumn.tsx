import { CaretRight, Infinity as InfinityIcon } from "@phosphor-icons/react";
import type { StatusAgentConfig } from "@trellis/api";
import { Button, cx, IconButton, StatusIcon } from "@trellis/ui";
import { type KeyboardEvent, useCallback, useRef } from "react";
import { workingGroupInsertIndex } from "../../columns";
import { useBoardAutoScroll, useColumnDnd } from "../../hooks/useBoardDnd";
import type { BoardColumnModel } from "../../types";
import { BoardCard } from "../BoardCard";
import { DragIndicator } from "../DragIndicator";
import { capacityLabel } from "./capacityLabel";
import { ColumnAgentSettings } from "./components/ColumnAgentSettings";

export type BoardColumnProps = {
	column: BoardColumnModel;
	collapsed: boolean;
	showAllDone: boolean;
	categoryMode: boolean;
	// The CSS width of an open column. The board computes it, so every open
	// column has the same width.
	width: string;
	// True in the light theme: the column is a grey well that holds white cards.
	well: boolean;
	workingTicketIds: ReadonlySet<string>;
	onToggle: () => void;
	onShowAllDone: () => void;
	onShowMore: () => Promise<void>;
	onOpenTicket: (identifier: string) => void;
	onFocusTicket: (identifier: string) => void;
	onCardKeyDown: (event: KeyboardEvent<HTMLElement>, column: BoardColumnModel, index: number) => void;
	onAnnounce: (message: string) => void;
	onUpdateSettings: (
		statusId: string,
		settings: { agentConfig: StatusAgentConfig | null; wipLimit: number | null },
	) => Promise<void>;
};

const cutoff = () => Date.now() - 30 * 86_400_000;

// One board column: a fixed 36 px header and a list of cards that scrolls
// under it. The header never scrolls, so every header stays at the same y.
export function BoardColumn({
	column,
	collapsed,
	showAllDone,
	categoryMode,
	width,
	well,
	workingTicketIds,
	onToggle,
	onShowAllDone,
	onShowMore,
	onOpenTicket,
	onFocusTicket,
	onCardKeyDown,
	onAnnounce,
	onUpdateSettings,
}: BoardColumnProps) {
	const target = useRef<HTMLElement>(null);
	const list = useRef<HTMLUListElement>(null);
	const expand = useCallback(() => {
		if (collapsed) onToggle();
	}, [collapsed, onToggle]);
	const over = useColumnDnd(target, column, collapsed, expand);
	useBoardAutoScroll(list, !collapsed);
	const singleStatus = column.statuses.length === 1 ? column.statuses[0]! : undefined;
	const visible =
		column.category === "done" && !showAllDone
			? column.items.filter((ticket) => ticket.completedAt !== null && Date.parse(ticket.completedAt) >= cutoff())
			: column.items;
	const count = column.category === "done" && !showAllDone ? visible.length : column.count;
	const dropIndex = over === null ? null : workingGroupInsertIndex(visible, over.ticketId, workingTicketIds);
	const exceeded = column.wipLimit !== null && column.count > column.wipLimit;
	const reviewer = column.statuses[0]?.reviewer ?? undefined;

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
					<IconButton label={`Expand ${column.name}`} icon={<CaretRight />} size="xs" onClick={onToggle} />
					<StatusIcon category={column.category} reviewer={reviewer} />
					<span className="mt-2 [writing-mode:vertical-rl] text-sm font-medium text-fg-muted">
						{column.name}{" "}
						<span className="tabular">{column.wipLimit === null ? `${count}/∞` : `${count}/${column.wipLimit}`}</span>
					</span>
					{singleStatus?.agentConfig && (
						<ColumnAgentSettings
							columnName={column.name}
							status={singleStatus}
							onSave={(settings) => onUpdateSettings(singleStatus.id, settings)}
						/>
					)}
				</li>
			</ul>
		);
	}

	return (
		<section
			ref={target}
			data-category={column.category}
			style={{ width }}
			className={cx("flex min-h-0 shrink-0 snap-start flex-col rounded-lg", well && "bg-band")}
		>
			<header className="flex h-9 shrink-0 items-center gap-2 px-2 text-fg pointer-coarse:h-12">
				<StatusIcon category={column.category} reviewer={reviewer} />
				<h2 className="min-w-0 truncate text-base font-medium">{column.name}</h2>
				<span className={cx("inline-flex items-center text-sm tabular", exceeded ? "text-warning" : "text-fg-faint")}>
					<span className="sr-only">{capacityLabel(count, column.wipLimit)}</span>
					<span aria-hidden="true" className="inline-flex items-center">
						{count}/{column.wipLimit === null ? <InfinityIcon className="size-3.5" /> : column.wipLimit}
					</span>
				</span>
				{singleStatus?.agentConfig && (
					<span className="ml-auto">
						<ColumnAgentSettings
							columnName={column.name}
							status={singleStatus}
							onSave={(settings) => onUpdateSettings(singleStatus.id, settings)}
						/>
					</span>
				)}
			</header>
			<ul
				ref={list}
				aria-label={`${column.name}, ${count} tickets`}
				data-category={column.category}
				className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1"
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
						onOpen={() => onOpenTicket(ticket.identifier)}
						onFocus={() => onFocusTicket(ticket.identifier)}
						onKeyDown={(event) => onCardKeyDown(event, column, index)}
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
				{visible.length < column.count && column.category !== "done" && (
					<li role="none" className="self-start">
						<Button variant="quiet" size="sm" onClick={() => void onShowMore()}>
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
