import { CaretRight, DotsThree, Plus } from "@phosphor-icons/react";
import { Button, cx, IconButton, Input, Menu, StatusIcon } from "@trellis/ui";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { useBoardAutoScroll, useColumnDnd } from "../../hooks/useBoardDnd";
import type { BoardColumnModel } from "../../types";
import { BoardCard } from "../BoardCard";
import { DragIndicator } from "../DragIndicator";
import { WipBadge } from "../WipBadge";
import { ColumnAgentBadge } from "./components/ColumnAgentBadge";

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
	onToggle: () => void;
	onShowAllDone: () => void;
	// Opens the New ticket form with the project and the column's status.
	onNewTicket: () => void;
	onShowMore: () => Promise<void>;
	onOpenTicket: (identifier: string) => void;
	onFocusTicket: (identifier: string) => void;
	onCardKeyDown: (event: KeyboardEvent<HTMLElement>, column: BoardColumnModel, index: number) => void;
	onAnnounce: (message: string) => void;
	// Writes the WIP limit of the column's single status. Category columns
	// group several statuses and never offer the edit.
	onSetWipLimit: (statusId: string, limit: number | null) => Promise<void>;
};

const cutoff = () => Date.now() - 30 * 86_400_000;

// The header buttons show on hover and on keyboard focus inside the header.
// A touch screen has no hover, so there they always show.
const revealed =
	"opacity-0 transition-opacity duration-hover group-hover/header:opacity-100 group-focus-within/header:opacity-100 [@media(hover:none)]:opacity-100";

// One board column: a fixed 36 px header and a list of cards that scrolls
// under it. The header never scrolls, so every header stays at the same y.
export function BoardColumn({
	column,
	collapsed,
	showAllDone,
	categoryMode,
	width,
	well,
	onToggle,
	onShowAllDone,
	onNewTicket,
	onShowMore,
	onOpenTicket,
	onFocusTicket,
	onCardKeyDown,
	onAnnounce,
	onSetWipLimit,
}: BoardColumnProps) {
	const target = useRef<HTMLElement>(null);
	const list = useRef<HTMLUListElement>(null);
	const expand = useCallback(() => {
		if (collapsed) onToggle();
	}, [collapsed, onToggle]);
	const over = useColumnDnd(target, column, collapsed, expand);
	useBoardAutoScroll(list, !collapsed);
	// The draft limit while the header editor is open. Null means the
	// editor is closed; an empty string clears the limit on commit.
	const [limitDraft, setLimitDraft] = useState<string | null>(null);
	const singleStatus = column.statuses.length === 1 ? column.statuses[0]! : undefined;
	const commitLimit = () => {
		if (limitDraft === null || singleStatus === undefined) return;
		const limit = limitDraft === "" ? null : Number(limitDraft);
		setLimitDraft(null);
		if (limitDraft !== "" && (!Number.isInteger(limit) || (limit as number) < 1)) return;
		if ((limit ?? null) === column.wipLimit) return;
		void onSetWipLimit(singleStatus.id, limit).catch(() => setLimitDraft(limitDraft));
	};
	const visible =
		column.category === "done" && !showAllDone
			? column.items.filter((ticket) => ticket.completedAt !== null && Date.parse(ticket.completedAt) >= cutoff())
			: column.items;
	const count = column.category === "done" && !showAllDone ? visible.length : column.count;
	const exceeded = column.wipLimit !== null && column.count > column.wipLimit;
	const reviewer = column.statuses[0]?.reviewer ?? undefined;
	const agentConfig = singleStatus?.agentConfig ?? null;

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
					over ? "border-accent" : "border-border",
				)}
			>
				<li role="none" className="contents">
					<IconButton label={`Expand ${column.name}`} icon={<CaretRight />} size="xs" onClick={onToggle} />
					<StatusIcon category={column.category} reviewer={reviewer} />
					{agentConfig && <ColumnAgentBadge columnName={column.name} config={agentConfig} />}
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
			data-category={column.category}
			style={{ width }}
			className={cx("flex min-h-0 shrink-0 snap-start flex-col rounded-lg", well && "bg-band")}
		>
			<header
				// The header is 48 px on a coarse pointer, so the 44 px plus and
				// actions buttons stay inside it and never cover the first card.
				className={cx(
					"group/header flex h-9 shrink-0 items-center gap-2 px-2 pointer-coarse:h-12",
					exceeded ? "text-warning" : "text-fg",
				)}
			>
				<StatusIcon category={column.category} reviewer={reviewer} />
				<h2 className="min-w-0 truncate text-base font-medium">{column.name}</h2>
				{agentConfig && <ColumnAgentBadge columnName={column.name} config={agentConfig} />}
				<span className="text-sm text-fg-faint tabular">{count}</span>
				{limitDraft !== null ? (
					<Input
						label={`WIP limit for ${column.name}`}
						hideLabel
						type="number"
						min={1}
						step={1}
						autoFocus
						value={limitDraft}
						onChange={(event) => setLimitDraft(event.target.value)}
						onBlur={commitLimit}
						onKeyDown={(event) => {
							if (event.key === "Enter") commitLimit();
							if (event.key === "Escape") setLimitDraft(null);
						}}
						className="w-16"
					/>
				) : (
					column.wipLimit !== null && <WipBadge count={column.count} limit={column.wipLimit} />
				)}
				<span className={cx("ml-auto flex items-center gap-0.5", revealed)}>
					<IconButton
						label={`New ticket in ${column.name}`}
						icon={<Plus />}
						size="xs"
						variant="primary"
						onClick={onNewTicket}
					/>
					<Menu
						label={`${column.name} actions`}
						trigger={<IconButton label={`${column.name} actions`} icon={<DotsThree />} size="xs" />}
						items={[
							...(singleStatus === undefined
								? []
								: [
										{
											label: "Set WIP limit",
											onSelect: () => setLimitDraft(column.wipLimit?.toString() ?? ""),
										},
									]),
							{ label: "Collapse", onSelect: onToggle },
						]}
					/>
				</span>
			</header>
			<ul
				ref={list}
				aria-label={`${column.name}, ${count} tickets`}
				data-category={column.category}
				className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1"
			>
				{over && visible.length === 0 && (
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
						onOpen={() => onOpenTicket(ticket.identifier)}
						onFocus={() => onFocusTicket(ticket.identifier)}
						onKeyDown={(event) => onCardKeyDown(event, column, index)}
						announce={onAnnounce}
						showStatus={categoryMode}
						dropBefore={over && index === 0}
					/>
				))}
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
