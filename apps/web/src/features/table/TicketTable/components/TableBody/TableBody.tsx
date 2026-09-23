import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { StatusSummary, TicketSummary } from "@trellis/api";
import { CheckConfetti, cx, useMediaQuery } from "@trellis/ui";
import {
	type MouseEvent,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Density } from "../../../../../stores/uiStore";
import { AgentLine } from "../../../AgentLine";
import type { ColumnId, TableKind } from "../../../columns";
import { phoneGroupHeaderHeight } from "../../../GroupHeader";
import type { RowSelection } from "../../../hooks/useRowSelection";
import { PrRow } from "../../../PrRow";
import { type EditField, Row, type RowChange } from "../../../Row";
import { agentLineHeight, groupHeaderHeight, phoneRowHeight, prRowHeight, rowHeights } from "../../../rowHeights";
import { phoneItems, type TableGroup, type TableItem } from "../../../utils/flattenGroups";
import type { WaveHeaderOptions } from "../../../WaveHeader";
import { EmptyWaveLine } from "../EmptyWaveLine";
import { GroupHeaderLine } from "../GroupHeaderLine";
import { ShowMoreRow, showMoreHeight } from "../ShowMoreRow";
import { TableSkeleton } from "../TableSkeleton";
import { useCheckConfetti } from "./useCheckConfetti";
import { useLineMotion } from "./useLineMotion";
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
	// True while the bulk bar shows. The list then gets 72 px of room under
	// its last row, so that row can scroll clear of the bar.
	bottomRoom: boolean;
};

// The box of a `CheckRibbon` of size `wide`, which is the bar a pull
// request row draws at its right end. The confetti layer sits over that box,
// 20 px in from the right edge of the row, the same inset the row's `pr-5`
// gives the bar.
const ribbonHeight = 12;

const heightOf = (item: TableItem, rowHeight: number, headerHeight: number) => {
	if (item.kind === "header") return headerHeight;
	if (item.kind === "agent") return agentLineHeight;
	if (item.kind === "pr") return prRowHeight;
	if (item.kind === "more") return showMoreHeight;
	return rowHeight;
};

// The scroll container and the virtual list inside it. Every line but the
// agent line has a fixed height. An agent line wraps its words, so the
// virtualizer measures it once it renders and moves the lines below it.
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
	bottomRoom,
}: TableBodyProps) {
	const viewport = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);
	// Below 768 px every row is two lines, so the row height changes with it.
	const phone = useMediaQuery("(max-width: 767px)");
	const rowHeight = phone ? phoneRowHeight : rowHeights[density];
	const headerHeight = phone ? phoneGroupHeaderHeight : groupHeaderHeight;
	const items = useMemo(() => (phone ? phoneItems(allItems) : allItems), [phone, allItems]);
	const [initialRect, setInitialRect] = useState({ width: 0, height: 0 });
	useLayoutEffect(() => {
		const { width, height } = viewport.current!.getBoundingClientRect();
		setInitialRect({ width, height });
	}, []);
	const headerIndexes = useMemo(() => items.flatMap((item, index) => (item.kind === "header" ? [index] : [])), [items]);
	const rangeExtractor = useCallback(
		(range: Parameters<typeof defaultRangeExtractor>[0]) =>
			[...new Set([...defaultRangeExtractor(range), ...headerIndexes])].sort((a, b) => a - b),
		[headerIndexes],
	);
	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => viewport.current,
		estimateSize: (index) => heightOf(items[index]!, rowHeight, headerHeight),
		enabled: initialRect.height > 0,
		initialRect,
		observeElementRect: (instance, callback) => {
			const element = instance.scrollElement!;
			let previous = { width: 0, height: 0 };
			const update = () => {
				const { width, height } = element.getBoundingClientRect();
				if (width === previous.width && height === previous.height) return;
				previous = { width, height };
				callback({ width, height });
			};
			update();
			instance.targetWindow!.addEventListener("resize", update);
			return () => instance.targetWindow!.removeEventListener("resize", update);
		},
		overscan: 8,
		rangeExtractor,
		getItemKey: (index) => items[index]!.key,
	});

	useLineMotion(body, items);
	const confetti = useCheckConfetti(items);

	const drop = useWaveDrop(items, selection.selected, virtualizer.measurementsCache, (ids, group) =>
		waves?.onDrop(ids, group),
	);

	// A density or a width change resizes every line.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the line heights are the trigger; the virtualizer is stable
	useEffect(() => virtualizer.measure(), [rowHeight, headerHeight]);

	useEffect(() => {
		const id = pendingFocus.current;
		if (id === null) return;
		const index = items.findIndex((item) => item.kind === "row" && item.ticket.id === id);
		if (index === -1) {
			pendingFocus.current = null;
			return;
		}
		virtualizer.scrollToIndex(index, { align: "auto" });
		const element = viewport.current?.querySelector<HTMLElement>(
			`[role="row"][data-identifier="${(items[index] as { ticket: TicketSummary }).ticket.identifier}"]`,
		);
		if (element === null || element === undefined) return;
		element.focus({ preventScroll: true });
		pendingFocus.current = null;
	});

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
			className={cx("min-h-0 flex-1 overflow-auto outline-none [scrollbar-gutter:stable]", bottomRoom && "pb-18")}
		>
			{loading ? (
				<TableSkeleton density={density} />
			) : (
				<div
					ref={body}
					data-table-body=""
					style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
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
									phone={phone}
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
									last={item.last}
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
								selected={selection.isSelected(ticket.id)}
								selecting={selection.count > 0}
								editing={editing?.id === ticket.id ? editing.field : null}
								statuses={statuses}
								onFocus={(id) => {
									if (pendingFocus.current === null) onFocusRow(id);
								}}
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
