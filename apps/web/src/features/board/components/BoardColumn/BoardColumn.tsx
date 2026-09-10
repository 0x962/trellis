import { Button, IconButton, StatusIcon } from "@trellis/ui";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { useColumnDnd } from "../../hooks/useBoardDnd";
import type { BoardColumnModel } from "../../types";
import { BoardCard } from "../BoardCard";
import { QuickAdd } from "../QuickAdd";
import { WipBadge } from "../WipBadge";

export type BoardColumnProps = {
	column: BoardColumnModel;
	collapsed: boolean;
	showAllDone: boolean;
	categoryMode: boolean;
	onToggle: () => void;
	onShowAllDone: () => void;
	onCreate: (title: string) => Promise<void>;
	onShowMore: () => Promise<void>;
	onOpenTicket: (identifier: string) => void;
	onFocusTicket: (identifier: string) => void;
	onCardKeyDown: (event: KeyboardEvent<HTMLElement>, column: BoardColumnModel, index: number) => void;
	onAnnounce: (message: string) => void;
};

const cutoff = () => Date.now() - 30 * 86_400_000;

export function BoardColumn({
	column,
	collapsed,
	showAllDone,
	categoryMode,
	onToggle,
	onShowAllDone,
	onCreate,
	onShowMore,
	onOpenTicket,
	onFocusTicket,
	onCardKeyDown,
	onAnnounce,
}: BoardColumnProps) {
	const ref = useRef<HTMLUListElement>(null);
	const expand = useCallback(() => {
		if (collapsed) onToggle();
	}, [collapsed, onToggle]);
	const over = useColumnDnd(ref, column, collapsed, expand);
	const [quickAdd, setQuickAdd] = useState(false);
	const visible =
		column.category === "done" && !showAllDone
			? column.items.filter((ticket) => ticket.completedAt !== null && Date.parse(ticket.completedAt) >= cutoff())
			: column.items;
	const count = column.category === "done" && !showAllDone ? visible.length : column.count;
	const exceeded = column.wipLimit !== null && column.count > column.wipLimit;

	if (collapsed) {
		return (
			<ul
				ref={ref}
				aria-label={`${column.name}, ${count} tickets`}
				data-category={column.category}
				className={`flex w-10 shrink-0 snap-start flex-col items-center rounded-md border border-border bg-surface py-2 ${over ? "bg-accent/4" : ""}`}
			>
				<li role="none" className="contents">
					<IconButton label={`Expand ${column.name}`} icon={<ChevronRight />} size="sm" onClick={onToggle} />
					<StatusIcon category={column.category} reviewer={column.statuses[0]?.reviewer ?? undefined} />
					<span className="mt-2 [writing-mode:vertical-rl] text-sm font-medium text-fg-muted">
						{column.name} <span className="tabular">{count}</span>
					</span>
				</li>
			</ul>
		);
	}

	return (
		<ul
			ref={ref}
			aria-label={`${column.name}, ${count} tickets`}
			data-category={column.category}
			className={`flex w-75 shrink-0 snap-start flex-col gap-2 rounded-md p-1 transition-colors duration-hover ${over ? "bg-accent/4" : ""}`}
		>
			<li role="none" className="contents">
				{/* The column is a flex column that shrinks its children when its cards
				overflow it. shrink-0 keeps the header 36 px tall in every column, so
				the column names line up. */}
				<header className={`flex h-9 shrink-0 items-center gap-2 px-1 ${exceeded ? "text-warning" : "text-fg"}`}>
					<StatusIcon category={column.category} reviewer={column.statuses[0]?.reviewer ?? undefined} />
					<h2 className="text-base font-medium">{column.name}</h2>
					<span className="text-sm text-fg-faint tabular">{count}</span>
					{column.wipLimit !== null && <WipBadge count={column.count} limit={column.wipLimit} />}
					<span className="ml-auto flex items-center gap-0.5">
						<IconButton
							label={`Add ticket to ${column.name}`}
							icon={<Plus />}
							size="sm"
							onClick={() => setQuickAdd(true)}
						/>
						<IconButton label={`Collapse ${column.name}`} icon={<ChevronLeft />} size="sm" onClick={onToggle} />
					</span>
				</header>
			</li>
			{quickAdd && (
				<li role="none">
					<QuickAdd
						columnName={column.name}
						onCreate={onCreate}
						onFullComposer={() => {}}
						open
						onOpenChange={setQuickAdd}
					/>
				</li>
			)}
			{visible.map((ticket, index) => (
				<BoardCard
					key={ticket.id}
					ticket={ticket}
					index={index}
					columnName={column.name}
					columnCount={visible.length}
					onOpen={() => onOpenTicket(ticket.identifier)}
					onFocus={() => onFocusTicket(ticket.identifier)}
					onKeyDown={(event) => onCardKeyDown(event, column, index)}
					announce={onAnnounce}
					showStatus={categoryMode}
				/>
			))}
			{visible.length < column.count && column.category !== "done" && (
				<li role="none">
					<Button variant="quiet" size="sm" onClick={() => void onShowMore()}>
						Show more
					</Button>
				</li>
			)}
			{column.category === "done" && !showAllDone && (
				<li role="none">
					<Button variant="quiet" size="sm" onClick={onShowAllDone}>
						Show all done
					</Button>
				</li>
			)}
			<li role="none">
				<QuickAdd columnName={column.name} onCreate={onCreate} onFullComposer={() => {}} />
			</li>
		</ul>
	);
}
