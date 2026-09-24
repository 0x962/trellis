import type { StatusSummary, TicketSummary } from "@trellis/api";
import { CheckConfetti, cx, useMediaQuery } from "@trellis/ui";
import { type MouseEvent, type RefObject, useMemo, useRef } from "react";
import { useStableCallback } from "../../../../../hooks/useStableCallback";
import type { Density } from "../../../../../stores/uiStore";
import { AgentLine } from "../../../AgentLine";
import type { ColumnId, TableKind } from "../../../columns";
import { phoneGroupHeaderHeight } from "../../../GroupHeader";
import type { RowSelection } from "../../../hooks/useRowSelection";
import { PrRow } from "../../../PrRow";
import { type EditField, Row, type RowChange } from "../../../Row";
import { groupHeaderHeight, phoneRowHeight, prRowHeight, rowHeights } from "../../../rowHeights";
import { phoneItems, type TableGroup, type TableItem } from "../../../utils/flattenGroups";
import type { WaveHeaderOptions } from "../../../WaveHeader";
import { waveBoxes } from "../../waveBoxes";
import { EmptyWaveLine } from "../EmptyWaveLine";
import { GroupHeaderLine } from "../GroupHeaderLine";
import { ShowMoreRow } from "../ShowMoreRow";
import { TableSkeleton } from "../TableSkeleton";
import { useCheckConfetti } from "./useCheckConfetti";
import { useDoneWash } from "./useDoneWash";
import { useLineMotion } from "./useLineMotion";
import { useTableVirtualizer } from "./useTableVirtualizer";
import { useWaveDrop } from "./useWaveDrop";

export type TableBodyProps = {
	items: readonly TableItem[];
	// On a phone, a row of an epic table draws the epic layout of `PhoneRow`.
	tableKind: TableKind;
	columns: readonly ColumnId[];
	density: Density;
	project?: string;
	statuses: readonly StatusSummary[];
	loading: boolean;
	// The ticket rows of the list, for `aria-rowcount`.
	rowCount: number;
	focusedId: string | null;
	// The id of a row a key moved the focus to. The body scrolls it into
	// view and focuses it once it mounts.
	pendingFocus: RefObject<string | null>;
	selection: RowSelection;
	editing: { id: string; field: EditField } | null;
	onFocusRow: (id: string) => void;
	onRowClick: (id: string, event: MouseEvent) => void;
	onOpen: (id: string) => void;
	onEditingChange: (id: string, field: EditField | null) => void;
	onRowChange: (ticket: TicketSummary, change: RowChange) => void;
	onToggleGroup: (key: string) => void;
	onToggleTicket: (ticketId: string) => void;
	// Opens the composer with the status of the group.
	onCreateInGroup: (group: TableGroup) => void;
	// Opens the Start wave dialog of a wave group of one epic. Undefined
	// until the table knows which tickets hold an agent run.
	onStartGroup?: (group: TableGroup) => void;
	// The wave controls of a table of one epic: the header actions of each
	// wave, and the drop of dragged rows into a wave group.
	waves?: WaveHeaderOptions & { onDrop: (ticketIds: string[], group: TableGroup) => void };
	// True on a table whose groups are the waves of one epic.
	pinHeaders?: boolean;
	// True while the bulk bar shows. The list then gets 72 px of room under
	// its last row, so that row can scroll clear of the bar.
	bottomRoom: boolean;
};

// The box of a `CheckRibbon` of size `wide`, which is the bar a pull
// request row draws at its right end. The confetti layer sits over that box,
// 20 px in from the right edge of the row, the same inset the row's `pr-5`
// gives the bar.
const ribbonHeight = 12;

export function TableBody({
	items: allItems,
	tableKind,
	columns,
	density,
	project,
	statuses,
	loading,
	rowCount,
	focusedId,
	pendingFocus,
	selection,
	editing,
	onFocusRow,
	onRowClick,
	onOpen,
	onEditingChange,
	onRowChange,
	onToggleGroup,
	onToggleTicket,
	onCreateInGroup,
	onStartGroup,
	waves,
	pinHeaders = false,
	bottomRoom,
}: TableBodyProps) {
	const viewport = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);
	// Below 768 px every row is two lines, so the row height changes with it.
	const phone = useMediaQuery("(max-width: 767px)");
	const rowHeight = phone ? phoneRowHeight : rowHeights[density];
	const headerHeight = phone ? phoneGroupHeaderHeight : groupHeaderHeight;
	const items = useMemo(() => (phone ? phoneItems(allItems) : allItems), [phone, allItems]);
	const { virtualizer, headerIndexes } = useTableVirtualizer({
		viewport,
		items,
		rowHeight,
		headerHeight,
		pendingFocus,
		scrollPaddingStart: pinHeaders ? headerHeight : 0,
	});

	useLineMotion(body, items);
	const confetti = useCheckConfetti(items);
	const wash = useDoneWash(items);

	const drop = useWaveDrop(items, selection.selected, virtualizer.measurementsCache, (ids, group) =>
		waves?.onDrop(ids, group),
	);

	// One callback for every row. A new one per row on each render of the
	// body defeats the memo of `Row`.
	const focusRow = useStableCallback((id: string) => {
		if (pendingFocus.current === null) onFocusRow(id);
	});

	// `getTotalSize` refreshes `measurementsCache`, which carries the height an
	// agent line took after it wrapped, so each box ends where the header line
	// of the next group starts.
	const totalSize = virtualizer.getTotalSize();
	const boxes = pinHeaders ? waveBoxes(headerIndexes, virtualizer.measurementsCache, totalSize) : undefined;
	// A row that the browser scrolls into view lands under the header that
	// stands at the top of the list, not behind it.
	const scrollRoom = pinHeaders ? { scrollPaddingTop: `${headerHeight}px` } : undefined;

	return (
		// biome-ignore lint/a11y/useSemanticElements: the grid is virtualized, so its rows are absolutely positioned divs.
		<div
			ref={viewport}
			role="grid"
			aria-rowcount={rowCount}
			aria-multiselectable="true"
			aria-busy={loading || undefined}
			data-table-viewport=""
			data-selecting={selection.count > 0 ? "" : undefined}
			tabIndex={-1}
			style={scrollRoom}
			className={cx("min-h-0 flex-1 overflow-auto outline-none [scrollbar-gutter:stable]", bottomRoom && "pb-18")}
		>
			{loading ? (
				<TableSkeleton density={density} />
			) : (
				<div
					ref={body}
					data-table-body=""
					style={{ height: `${totalSize}px`, position: "relative" }}
					{...(waves === undefined ? {} : drop.handlers)}
				>
					{virtualizer.getVirtualItems().map((virtual) => {
						const item = items[virtual.index]!;
						if (item.kind === "header") {
							return (
								<GroupHeaderLine
									key={virtual.key}
									group={item.group}
									top={virtual.start}
									box={boxes?.get(virtual.index)}
									phone={phone}
									filling={wash.waves.includes(item.group.key)}
									waves={waves}
									onToggleGroup={onToggleGroup}
									onCreateInGroup={onCreateInGroup}
									onStartGroup={onStartGroup}
								/>
							);
						}
						if (item.kind === "empty") {
							return <EmptyWaveLine key={virtual.key} group={item.group.key} height={rowHeight} top={virtual.start} />;
						}
						if (item.kind === "agent") {
							return (
								<AgentLine
									key={virtual.key}
									line={item.line}
									top={virtual.start}
									depth={item.depth}
									index={virtual.index}
									measureRef={virtualizer.measureElement}
								/>
							);
						}
						if (item.kind === "pr") {
							return (
								<PrRow
									key={virtual.key}
									pr={item.pr}
									top={virtual.start}
									last={item.last}
									hasChildLines={item.hasChildLines}
								/>
							);
						}
						if (item.kind === "more") {
							return (
								<ShowMoreRow
									key={virtual.key}
									label={item.group.label ?? ""}
									loading={item.group.loading ?? false}
									onLoadMore={() => item.group.loadMore?.()}
									top={virtual.start}
								/>
							);
						}
						const { ticket } = item;
						return (
							<Row
								key={virtual.key}
								ticket={ticket}
								density={density}
								columns={columns as string[]}
								viewedProject={project}
								top={virtual.start}
								group={item.group.key}
								phone={phone}
								phoneLayout={tableKind}
								agentLine={phone ? item.agentLine : null}
								disclosure={item.disclosure}
								hasChildLines={item.hasChildLines}
								focused={ticket.id === focusedId}
								washing={wash.tickets.includes(ticket.id)}
								selected={selection.isSelected(ticket.id)}
								selecting={selection.count > 0}
								editing={editing?.id === ticket.id ? editing.field : null}
								statuses={statuses}
								onFocus={focusRow}
								onClick={onRowClick}
								onToggleDisclosure={onToggleTicket}
								onOpen={onOpen}
								onToggleSelect={selection.toggle}
								onEditingChange={onEditingChange}
								onChange={onRowChange}
							/>
						);
					})}
					{confetti.map((prId) => {
						const index = items.findIndex((item) => item.kind === "pr" && item.pr.id === prId);
						const start = index === -1 ? undefined : virtualizer.measurementsCache[index]?.start;
						if (start === undefined) return null;
						return (
							<div
								key={prId}
								aria-hidden="true"
								style={{ top: `${start + (prRowHeight - ribbonHeight) / 2}px` }}
								className="pointer-events-none absolute right-5 z-10 h-3 w-48"
							>
								<CheckConfetti />
							</div>
						);
					})}
					{drop.frame !== null && (
						<div
							aria-hidden="true"
							data-drop-frame=""
							style={{ height: `${drop.frame.height}px`, transform: `translateY(${drop.frame.top}px)` }}
							className="pointer-events-none absolute top-0 left-0 z-20 w-full rounded-md border-2 border-accent bg-accent-soft/40"
						/>
					)}
				</div>
			)}
		</div>
	);
}
